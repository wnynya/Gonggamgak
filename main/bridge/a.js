function send(i, d) {
  let val = '';
  for (let j = 0; j < d[i].length; j++) {
    val += parseInt(d[i][j], 2).toString(16).toUpperCase();
  }
  console.log(val);
  wsc.event('microwave-serial', {
    to: i,
    text: `r[${val}]`,
  });
}

async function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

(async () => {
  const frames = [
    ['01111111', '01111111', '01111111', '01111111'],
    ['01111110', '01111111', '01111111', '01111111'],
  ];

  for (let i = 0; i < frames.length; i++) {
    send(2, frames[i]);
    await delay(1000);
  }
})();
