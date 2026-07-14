import { FIELD_HEIGHT, FIELD_WIDTH } from './formations';

export const PITCH_FILL = '#1a7a45';
export const PITCH_LINE = 'rgba(255,255,255,0.92)';

export function pitchMarkupSvgInner(): string {
  return `
    <rect width="${FIELD_WIDTH}" height="${FIELD_HEIGHT}" fill="${PITCH_FILL}"/>
    <g fill="none" stroke="${PITCH_LINE}" stroke-width="2">
      <rect x="30" y="30" width="500" height="720"/>
      <line x1="30" y1="390" x2="530" y2="390"/>
      <circle cx="280" cy="390" r="65"/>
      <rect x="150" y="30" width="260" height="130"/>
      <rect x="200" y="30" width="160" height="50"/>
      <path d="M 210 160 A 65 65 0 0 0 350 160"/>
      <rect x="150" y="620" width="260" height="130"/>
      <rect x="200" y="700" width="160" height="50"/>
      <path d="M 210 620 A 65 65 0 0 1 350 620"/>
      <path d="M 30 40 A 10 10 0 0 0 40 30"/>
      <path d="M 520 30 A 10 10 0 0 0 530 40"/>
      <path d="M 30 740 A 10 10 0 0 1 40 750"/>
      <path d="M 520 750 A 10 10 0 0 1 530 740"/>
      <rect x="230" y="18" width="100" height="12"/>
      <rect x="230" y="750" width="100" height="12"/>
    </g>
    <circle cx="280" cy="390" r="3" fill="${PITCH_LINE}"/>
    <circle cx="280" cy="120" r="3" fill="${PITCH_LINE}"/>
    <circle cx="280" cy="660" r="3" fill="${PITCH_LINE}"/>
  `;
}

export function createPitchSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pitch-svg');
  svg.innerHTML = pitchMarkupSvgInner();
  return svg;
}
