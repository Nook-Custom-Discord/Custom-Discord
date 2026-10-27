// Alle generierten Kunst-Stile (Netze, Dornen, Kristalle, Anime) in einer Liste.
// Jeder Eintrag liefert Bilder für Avatar-Deko ('ring'), Namensschild ('plate') und Profil-Effekt ('card')
// und gibt an, welche Partikel im Profil-Effekt fliegen (Tropfen, Blütenblätter, Funkeln).
import { WEBS, webArt } from './membrane';
import { THORNS, thornArt } from './thorns';
import { CRYSTALS, crystalArt } from './crystals';
import { ANIME, animeArt } from './anime';

export const ARTS = [
  ...Object.entries(WEBS).map(([v, p]) => ({ id: 'web-' + v, name: p.name, family: 'Netze', glow: p.glow, particle: 'drip', pc: p.cell[0], frameBg: p.dark, src: (kind, anim) => webArt(v, kind, anim) })),
  ...Object.entries(THORNS).map(([v, p]) => ({ id: 'thorn-' + v, name: p.name, family: 'Dornen', glow: p.glow, particle: 'petal', pc: p.rose[0], frameBg: p.vine, src: (kind, anim) => thornArt(v, kind, anim) })),
  ...Object.entries(CRYSTALS).map(([v, p]) => ({ id: 'crystal-' + v, name: p.name, family: 'Kristalle', glow: p.glow, particle: 'spark', pc: p.a, frameBg: p.c, src: (kind, anim) => crystalArt(v, kind, anim) })),
  ...Object.entries(ANIME).map(([v, p]) => ({ id: 'anime-' + v, name: p.name, family: 'Anime', glow: p.glow, particle: p.particle, pc: p.pc, frameBg: p.frameBg, src: (kind, anim) => animeArt(v, kind, anim) })),
];
export const ART_BY_ID = Object.fromEntries(ARTS.map((a) => [a.id, a]));
