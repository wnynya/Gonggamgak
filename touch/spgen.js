const d = 200; // sphere diameter mm

const n = 12; // number of pieces

const h = (Math.PI * d) / 2; // pole-to-pole seam length = 314.159...

const maxW = (Math.PI * d) / n; // center width = 78.54...

const steps = 32;

function xRight(y) {
  // half width at height y

  return (maxW / 2) * Math.sin((Math.PI * y) / h);
}

let right = [];

let left = [];

for (let i = 0; i <= steps; i++) {
  const y = (h * i) / steps;

  const x = xRight(y);

  right.push([x, y]);

  left.push([-x, y]);
}

const points = [...right, ...left.reverse()];

const margin = 10;

const svgW = maxW + margin * 2;

const svgH = h + margin * 2;

const path =
  points

    .map(([x, y], i) => {
      const px = x + svgW / 2;

      const py = y + margin;

      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(3)} ${py.toFixed(3)}`;
    })

    .join(' ') + ' Z';

const svg = `

<svg xmlns="http://www.w3.org/2000/svg"

     width="${svgW.toFixed(3)}mm"

     height="${svgH.toFixed(3)}mm"

     viewBox="0 0 ${svgW.toFixed(3)} ${svgH.toFixed(3)}">

  <path d="${path}"

        fill="none"

        stroke="black"

        stroke-width="0.3"/>

  <line x1="${(svgW / 2).toFixed(3)}" y1="${margin}"

        x2="${(svgW / 2).toFixed(3)}" y2="${(h + margin).toFixed(3)}"

        stroke="gray" stroke-width="0.2" stroke-dasharray="2 2"/>

</svg>

`;

console.log(svg);
