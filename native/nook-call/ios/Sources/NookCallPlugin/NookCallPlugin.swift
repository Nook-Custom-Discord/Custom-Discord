import Foundation
import AVFoundation
import UIKit
import Security
import Capacitor
import WebRTC

// Native Sprachverbindung für die iPhone-App.
// Die Web-Ansicht von iOS schaltet Mikrofon und Ton ab, sobald der Bildschirm gesperrt wird. Deshalb läuft die
// Sprache hier über die native WebRTC-Bibliothek ("Spur a"). Das iPhone schickt immer das Angebot, die Gegenseite
// (Nook am PC oder im Browser) antwortet nur. Signale gehen als Events an die Oberfläche, die sie über den
// Nook-Server weiterleitet. Kamera und Bildschirm-Streams laufen weiter in der Web-Ansicht.
@objc(NookCallPlugin)
public class NookCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NookCallPlugin"
    public let jsName = "NookCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createPeer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closePeer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listPeers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDeafened", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "levels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLogin", returnType: CAPPluginReturnPromise),
    ]

    // ---------- Angemeldet bleiben ----------
    // Server-Adresse und Anmelde-Schlüssel (kein Passwort) liegen im iPhone-Schlüsselbund. Der bleibt erhalten,
    // auch wenn iOS den Speicher der Web-Ansicht leert oder die App neu aufgespielt wird.
    private static let loginQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app.nook.client.login",
        kSecAttrAccount as String: "login",
    ]

    @objc func saveLogin(_ call: CAPPluginCall) {
        guard let server = call.getString("server"), let token = call.getString("token"), !token.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: ["server": server, "token": token]) else {
            return call.reject("Anmeldedaten fehlen")
        }
        SecItemDelete(NookCallPlugin.loginQuery as CFDictionary)
        var item = NookCallPlugin.loginQuery
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(item as CFDictionary, nil)
        if status == errSecSuccess { call.resolve() } else { call.reject("Schlüsselbund-Fehler \(status)") }
    }

    @objc func loadLogin(_ call: CAPPluginCall) {
        var query = NookCallPlugin.loginQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
            return call.resolve([:])
        }
        call.resolve(["server": obj["server"] ?? "", "token": obj["token"] ?? ""])
    }

    @objc func clearLogin(_ call: CAPPluginCall) {
        SecItemDelete(NookCallPlugin.loginQuery as CFDictionary)
        call.resolve()
    }

    // ---------- Ton am Leben halten ----------
    // iOS (bzw. die Web-Ansicht) kann die Ton-Sitzung beim Minimieren/Sperren umstellen oder abschalten.
    // Ein Wächter prüft das laufend und holt sich den Ton sofort zurück.
    private var log: [String] = []
    private var watchdog: Timer?
    private var observers: [NSObjectProtocol] = []
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    fileprivate func note(_ text: String) {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        log.append("\(f.string(from: Date())) \(text)")
        if log.count > 60 { log.removeFirst(log.count - 60) }
        print("NookCall: \(text)")
    }

    private var inCall: Bool { audioTrack != nil }

    private func startGuard() {
        guard watchdog == nil else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.inCall else { return }
            self.note("App im Hintergrund")
            // Kurze Schonfrist von iOS, falls der Ton gerade neu gestartet werden muss
            if self.bgTask == .invalid {
                self.bgTask = UIApplication.shared.beginBackgroundTask(withName: "NookCall") { [weak self] in
                    guard let self = self else { return }
                    UIApplication.shared.endBackgroundTask(self.bgTask)
                    self.bgTask = .invalid
                }
            }
            for delay in [0.15, 0.5, 1.0, 2.0, 4.0] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.checkAudio(reason: "Hintergrund") }
            }
        })
        observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.inCall else { return }
            self.note("App wieder vorne")
            self.checkAudio(reason: "Vordergrund")
            if self.bgTask != .invalid {
                UIApplication.shared.endBackgroundTask(self.bgTask)
                self.bgTask = .invalid
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            guard let self = self, self.inCall else { return }
            let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
            let type = AVAudioSession.InterruptionType(rawValue: raw)
            self.note(type == .began ? "Ton unterbrochen (iOS)" : "Unterbrechung vorbei")
            if type == .ended {
                self.reassert(reason: "nach Unterbrechung")
            } else {
                // z. B. Web-Ansicht hat sich den Ton geschnappt -> kurz danach zurückholen
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.checkAudio(reason: "Unterbrechung") }
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.inCall else { return }
            self.note("Ausgabe: \(self.routeName())")
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.inCall else { return }
            self.note("iOS-Tondienst neu gestartet")
            self.reassert(reason: "Tondienst-Neustart")
        })
        watchdog = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            self?.checkAudio(reason: "Wächter")
        }
    }

    private func stopGuard() {
        watchdog?.invalidate()
        watchdog = nil
        for o in observers { NotificationCenter.default.removeObserver(o) }
        observers.removeAll()
        if bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
    }

    private func checkAudio(reason: String) {
        guard inCall else { return }
        let session = AVAudioSession.sharedInstance()
        let rtc = RTCAudioSession.sharedInstance()
        if session.category != .playAndRecord || !rtc.isActive || !rtc.isAudioEnabled {
            note("Ton weg (\(reason)): \(session.category.rawValue), aktiv=\(rtc.isActive)")
            reassert(reason: reason)
        }
    }

    private func reassert(reason: String) {
        guard inCall else { return }
        configureAudio()
        let rtc = RTCAudioSession.sharedInstance()
        // Audio-Einheit neu anstoßen
        rtc.isAudioEnabled = false
        rtc.isAudioEnabled = true
        note("Ton neu gestartet (\(reason)) -> aktiv=\(rtc.isActive)")
    }

    private func routeName() -> String {
        AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portName }.joined(separator: ", ")
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            var peerStates = JSObject()
            for (uid, peer) in self.peers { peerStates[uid] = peer.stateName }
            call.resolve([
                "category": session.category.rawValue,
                "mode": session.mode.rawValue,
                "active": RTCAudioSession.sharedInstance().isActive,
                "route": self.routeName(),
                "peers": peerStates,
                "log": self.log,
            ])
        }
    }

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory(encoderFactory: RTCDefaultVideoEncoderFactory(), decoderFactory: RTCDefaultVideoDecoderFactory())
    }()

    private var iceServers: [RTCIceServer] = []
    private var audioTrack: RTCAudioTrack?
    private var peers: [String: NookPeer] = [:]
    private var muted = false
    private var deafened = false

    // ---------- Aufrufe aus der Oberfläche ----------

    @objc func start(_ call: CAPPluginCall) {
        let servers = call.getArray("iceServers", JSObject.self) ?? []
        let muted = call.getBool("muted") ?? false
        let deafened = call.getBool("deafened") ?? false
        DispatchQueue.main.async {
            self.iceServers = servers.compactMap { NookCallPlugin.iceServer($0) }
            if self.iceServers.isEmpty {
                self.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
            }
            self.muted = muted
            self.deafened = deafened
            // Ton-Einheit selbst steuern, damit sie nach einer Unterbrechung neu angestoßen werden kann
            RTCAudioSession.sharedInstance().useManualAudio = true
            self.configureAudio()
            if self.audioTrack == nil {
                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                let source = NookCallPlugin.factory.audioSource(with: constraints)
                self.audioTrack = NookCallPlugin.factory.audioTrack(with: source, trackId: "nook-mic")
            }
            RTCAudioSession.sharedInstance().isAudioEnabled = true
            self.applyMute()
            self.startGuard()
            self.note("Anruf gestartet, Ausgabe: \(self.routeName())")
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopGuard()
            for peer in self.peers.values { peer.close() }
            self.peers.removeAll()
            self.audioTrack = nil
            self.note("Anruf beendet")
            RTCAudioSession.sharedInstance().isAudioEnabled = false
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            do { try session.setActive(false) } catch { print("NookCall: Audio aus fehlgeschlagen: \(error)") }
            session.unlockForConfiguration()
            call.resolve()
        }
    }

    @objc func createPeer(_ call: CAPPluginCall) {
        guard let uid = call.getString("uid") else { return call.reject("uid fehlt") }
        DispatchQueue.main.async {
            if self.peers[uid] == nil { self.makePeer(uid) }
            call.resolve()
        }
    }

    @objc func closePeer(_ call: CAPPluginCall) {
        guard let uid = call.getString("uid") else { return call.reject("uid fehlt") }
        DispatchQueue.main.async {
            self.peers[uid]?.close()
            self.peers.removeValue(forKey: uid)
            call.resolve()
        }
    }

    @objc func listPeers(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["uids": Array(self.peers.keys)])
        }
    }

    @objc func signal(_ call: CAPPluginCall) {
        guard let uid = call.getString("uid") else { return call.reject("uid fehlt") }
        let desc = call.getObject("desc")
        let cand = call.getObject("cand")
        DispatchQueue.main.async {
            guard let peer = self.peers[uid], let pc = peer.pc else { return call.resolve() }
            if let d = desc, let type = d["type"] as? String, let sdp = d["sdp"] as? String, type == "answer" {
                pc.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp)) { error in
                    DispatchQueue.main.async {
                        if let error = error { print("NookCall: Antwort abgelehnt: \(error)") }
                        peer.remoteSet = true
                        peer.flushCandidates()
                    }
                }
            }
            if let c = cand, let s = c["candidate"] as? String, !s.isEmpty {
                let index = (c["sdpMLineIndex"] as? NSNumber)?.int32Value ?? 0
                let candidate = RTCIceCandidate(sdp: s, sdpMLineIndex: index, sdpMid: c["sdpMid"] as? String)
                if peer.remoteSet {
                    pc.add(candidate) { _ in }
                } else {
                    peer.pending.append(candidate)
                }
            }
            call.resolve()
        }
    }

    @objc func setMuted(_ call: CAPPluginCall) {
        let value = call.getBool("muted") ?? false
        DispatchQueue.main.async {
            self.muted = value
            self.applyMute()
            call.resolve()
        }
    }

    @objc func setDeafened(_ call: CAPPluginCall) {
        let value = call.getBool("deafened") ?? false
        DispatchQueue.main.async {
            self.deafened = value
            self.applyMute()
            call.resolve()
        }
    }

    // Lautstärke (0…1) je Person und vom eigenen Mikro – für die „spricht gerade“-Anzeige
    @objc func levels(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let all = self.peers
            let lock = NSLock()
            var levels: [String: Double] = [:]
            var mine = 0.0
            let group = DispatchGroup()
            for (uid, peer) in all {
                guard let pc = peer.pc else { continue }
                group.enter()
                pc.statistics { report in
                    var remote = 0.0
                    var local = 0.0
                    for (_, s) in report.statistics {
                        let kind = s.values["kind"] as? String
                        let level = (s.values["audioLevel"] as? NSNumber)?.doubleValue ?? 0
                        if s.type == "inbound-rtp" && kind == "audio" { remote = max(remote, level) }
                        if s.type == "media-source" && kind == "audio" { local = max(local, level) }
                    }
                    lock.lock()
                    levels[uid] = remote
                    mine = max(mine, local)
                    lock.unlock()
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                var peersObj = JSObject()
                for (uid, level) in levels { peersObj[uid] = level }
                call.resolve(["me": mine, "peers": peersObj])
            }
        }
    }

    // ---------- intern ----------

    private static func iceServer(_ obj: JSObject) -> RTCIceServer? {
        var urls: [String] = []
        if let u = obj["urls"] as? String { urls = [u] }
        else if let list = obj["urls"] as? [Any] { urls = list.compactMap { $0 as? String } }
        else if let u = obj["url"] as? String { urls = [u] }
        if urls.isEmpty { return nil }
        return RTCIceServer(urlStrings: urls, username: obj["username"] as? String, credential: obj["credential"] as? String)
    }

    private func configureAudio() {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.voiceChat.rawValue
        // Lautsprecher statt Hörmuschel (wie bei Discord), Bluetooth-Headsets erlaubt, Musik anderer Apps läuft leise weiter
        config.categoryOptions = [.allowBluetooth, .defaultToSpeaker, .mixWithOthers]
        do { try session.setConfiguration(config, active: true) } catch { print("NookCall: Audio-Einstellung fehlgeschlagen: \(error)") }
        session.unlockForConfiguration()
    }

    private func applyMute() {
        audioTrack?.isEnabled = !muted && !deafened
        for peer in peers.values { peer.setReceiving(!deafened) }
    }

    private func makePeer(_ uid: String) {
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let peer = NookPeer(uid: uid, plugin: self)
        guard let pc = NookCallPlugin.factory.peerConnection(with: config, constraints: constraints, delegate: peer) else {
            print("NookCall: Verbindung konnte nicht erstellt werden")
            return
        }
        peer.pc = pc
        if let track = audioTrack { _ = pc.add(track, streamIds: ["nook-mic"]) }
        peers[uid] = peer
        peer.makeOffer(restart: false)
    }

    fileprivate var isDeafened: Bool { deafened }

    fileprivate func emitOffer(_ peer: NookPeer, _ desc: RTCSessionDescription, fresh: Bool) {
        let d: JSObject = ["type": "offer", "sdp": desc.sdp]
        notifyListeners("signal", data: ["uid": peer.uid, "desc": d, "fresh": fresh])
    }

    fileprivate func emitCandidate(_ peer: NookPeer, _ c: RTCIceCandidate) {
        let cand: JSObject = ["candidate": c.sdp, "sdpMid": c.sdpMid ?? "0", "sdpMLineIndex": Int(c.sdpMLineIndex)]
        notifyListeners("signal", data: ["uid": peer.uid, "cand": cand])
    }

    fileprivate func emitState(_ peer: NookPeer, _ state: String) {
        notifyListeners("state", data: ["uid": peer.uid, "state": state])
    }
}

// Eine native Sprachverbindung zu einer Person
final class NookPeer: NSObject, RTCPeerConnectionDelegate {
    let uid: String
    weak var plugin: NookCallPlugin?
    var pc: RTCPeerConnection?
    var remoteSet = false
    var pending: [RTCIceCandidate] = []
    var stateName = "neu"
    private var offers = 0
    private var closed = false
    private var restartWork: DispatchWorkItem?

    init(uid: String, plugin: NookCallPlugin) {
        self.uid = uid
        self.plugin = plugin
    }

    func makeOffer(restart: Bool) {
        guard let pc = pc, !closed else { return }
        var mandatory = ["OfferToReceiveAudio": "true"]
        if restart { mandatory["IceRestart"] = "true" }
        let constraints = RTCMediaConstraints(mandatoryConstraints: mandatory, optionalConstraints: nil)
        pc.offer(for: constraints) { [weak self] sdp, error in
            guard let self = self, let sdp = sdp, error == nil else { return }
            DispatchQueue.main.async {
                guard let pc = self.pc, !self.closed else { return }
                pc.setLocalDescription(sdp) { error in
                    DispatchQueue.main.async {
                        guard error == nil, !self.closed else { return }
                        let fresh = self.offers == 0
                        self.offers += 1
                        self.remoteSet = false
                        self.plugin?.emitOffer(self, sdp, fresh: fresh)
                    }
                }
            }
        }
    }

    func flushCandidates() {
        guard let pc = pc else { return }
        for c in pending { pc.add(c) { _ in } }
        pending.removeAll()
    }

    func setReceiving(_ on: Bool) {
        guard let pc = pc else { return }
        for receiver in pc.receivers {
            if let track = receiver.track as? RTCAudioTrack { track.isEnabled = on }
        }
    }

    func close() {
        closed = true
        restartWork?.cancel()
        pc?.close()
        pc = nil
    }

    private func tuneBitrate() {
        guard let pc = pc else { return }
        for sender in pc.senders where sender.track?.kind == "audio" {
            let params = sender.parameters
            for enc in params.encodings { enc.maxBitrateBps = NSNumber(value: 128_000) }
            sender.parameters = params
        }
    }

    // ---------- RTCPeerConnectionDelegate ----------

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        DispatchQueue.main.async {
            let on = !(self.plugin?.isDeafened ?? false)
            for track in stream.audioTracks { track.isEnabled = on }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        DispatchQueue.main.async {
            guard !self.closed else { return }
            switch newState {
            case .new: self.stateName = "neu"
            case .checking: self.stateName = "verbindet"
            case .connected, .completed: self.stateName = "verbunden"
            case .failed: self.stateName = "fehlgeschlagen"
            case .disconnected: self.stateName = "getrennt"
            case .closed: self.stateName = "geschlossen"
            default: self.stateName = "?"
            }
            self.plugin?.note("Verbindung \(self.uid.prefix(6)): \(self.stateName)")
            switch newState {
            case .connected, .completed:
                self.restartWork?.cancel()
                self.restartWork = nil
                self.tuneBitrate()
                self.setReceiving(!(self.plugin?.isDeafened ?? false))
                self.plugin?.emitState(self, "connected")
            case .failed, .disconnected:
                self.plugin?.emitState(self, newState == .failed ? "failed" : "disconnected")
                // Netz gewechselt (WLAN <-> Mobilfunk) oder kurz weg: Verbindung neu aushandeln
                if self.restartWork == nil {
                    let work = DispatchWorkItem { [weak self] in
                        guard let self = self, !self.closed else { return }
                        self.restartWork = nil
                        let state = self.pc?.iceConnectionState
                        if state == .failed || state == .disconnected { self.makeOffer(restart: true) }
                    }
                    self.restartWork = work
                    DispatchQueue.main.asyncAfter(deadline: .now() + (newState == .failed ? 1 : 4), execute: work)
                }
            default:
                break
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        DispatchQueue.main.async {
            guard !self.closed else { return }
            self.plugin?.emitCandidate(self, candidate)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
