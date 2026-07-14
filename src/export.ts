import type { Game, LineupState, LineupPlayer } from './types';
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FORMATIONS,
  assignSlots,
  positionGroup,
} from './formations';
import { getStarters, getSubs } from './lineup';
import { pitchMarkupSvgInner } from './field';
import { el } from './dom';
import { foregroundFor, isDarkColor, normalizeHexColor } from './color';

const GK_COLOR = '#e08a1e';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function coordsFor(state: LineupState, player: LineupPlayer, slotIdx: number): [number, number] {
  const formation = FORMATIONS[state.formation] ?? FORMATIONS['4-4-2'];
  const base = formation.coords[slotIdx] ?? [FIELD_WIDTH / 2, FIELD_HEIGHT / 2];
  const custom = state.customPositions[player.id];
  return custom ? [custom.x, custom.y] : [base[0], base[1]];
}

function buildFieldSvg(state: LineupState, teamColor: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`);
  svg.setAttribute('width', '360');
  svg.setAttribute('height', '500');
  svg.innerHTML = pitchMarkupSvgInner();

  const kit = normalizeHexColor(teamColor);
  const kitText = foregroundFor(kit);
  const kitStrokeWidth = isDarkColor(kit) ? 3 : 2;

  const starters = getStarters(state);
  const slots = assignSlots(state.formation, starters, state.slotOverrides);
  starters.forEach((player, i) => {
    const slotIdx = slots[i] ?? i;
    const [x, y] = coordsFor(state, player, slotIdx);
    const isGk = positionGroup(player.pos) === 'GK';
    const fill = isGk ? GK_COLOR : kit;
    const textFill = isGk ? '#ffffff' : kitText;
    const strokeWidth = isGk ? 2 : kitStrokeWidth;
    svg.append(svgEl('circle', { cx: x, cy: y, r: 22, fill, stroke: '#fff', 'stroke-width': strokeWidth }));
    const label = svgEl('text', {
      x,
      y: y + 4,
      'text-anchor': 'middle',
      fill: textFill,
      'font-size': 9,
      'font-weight': 'bold',
      'font-family': 'sans-serif',
    });
    label.textContent = player.name.slice(0, 12);
    svg.append(label);
  });
  return svg;
}

const POSITION_ORDER = [
  'GK', 'LCB', 'CB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
];

function buildTable(title: string, players: LineupPlayer[]): HTMLElement {
  const byPos = new Map<string, string[]>();
  for (const p of players) {
    const list = byPos.get(p.pos) ?? [];
    list.push(p.name);
    byPos.set(p.pos, list);
  }
  const rows: HTMLElement[] = [];
  for (const pos of POSITION_ORDER) {
    const names = byPos.get(pos);
    if (!names) continue;
    rows.push(el('tr', {}, [el('td', {}, [pos]), el('td', {}, [names.join(', ')])]));
  }
  return el('div', { class: 'export-col' }, [
    el('h3', {}, [title]),
    el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', {}, ['Position']), el('th', {}, ['Players'])])]),
      el('tbody', {}, rows),
    ]),
  ]);
}

function buildExportArea(game: Game, state: LineupState): HTMLElement {
  const starters = getStarters(state);
  const subs = getSubs(state);
  const heading = `${game.opponent || 'Match'} — ${state.formation}`;
  const area = el('div', { class: 'export-area', id: 'export-area' }, [
    el('h1', { style: 'font-size:16px;margin-bottom:8px;color:#16181d;font-family:sans-serif;' }, [
      heading,
    ]),
    el(
      'div',
      { style: 'display:flex;gap:16px;align-items:flex-start;font-family:sans-serif;color:#222;' },
      [
        buildTable('Starting XI', starters),
        (() => {
          const wrap = el('div', {});
          wrap.append(buildFieldSvg(state, game.teamColor));
          return wrap;
        })(),
        subs.length > 0 ? buildTable('Substitutes', subs) : el('div', {}),
      ],
    ),
  ]);
  const style = el('style', {}, [
    `#export-area table{border-collapse:collapse;font-size:11px;margin-top:4px;}
     #export-area th,#export-area td{border:1px solid #ccc;padding:2px 6px;text-align:left;}
     #export-area th{background:#eee;} #export-area h3{font-size:12px;margin-bottom:2px;}`,
  ]);
  area.prepend(style);
  return area;
}

async function renderPng(game: Game, state: LineupState): Promise<string> {
  const area = buildExportArea(game, state);
  area.style.left = '0';
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.zIndex = '-1';
  document.body.append(area);
  try {
    await new Promise((r) => setTimeout(r, 60));
    const { toPng } = await import('html-to-image');
    return await toPng(area, { quality: 1, pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true });
  } finally {
    area.remove();
  }
}

function slugFileName(game: Game): string {
  return (game.opponent || 'lineup').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function exportPng(game: Game, state: LineupState): Promise<void> {
  const dataUrl = await renderPng(game, state);
  const link = el('a', { download: `lineup-${slugFileName(game)}.png`, href: dataUrl });
  link.click();
}

export async function exportPdf(game: Game, state: LineupState): Promise<void> {
  const dataUrl = await renderPng(game, state);
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not render export image.'));
  });
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = 190;
  const pdfHeight = (img.height / img.width) * pdfWidth;
  pdf.addImage(dataUrl, 'PNG', 10, 12, pdfWidth, Math.min(pdfHeight, 265));
  pdf.save(`lineup-${slugFileName(game)}.pdf`);
}
