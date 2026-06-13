(() => {
  const d = [
    ['11111101', '11111111', '11111111', '11111111'],
    ['11111110', '11111110', '11111110', '11111110'],
  ];

  for (let i = 0; i < d.length; i++) {
    let val = '';
    for (let j = 0; j < d[i].length; j++) {
      val += parseInt(d[i][j], 2).toString(16).toUpperCase();
    }
    console.log(val);
    wsc.event('microwave-serial', {
      to: i + 1,
      text: `r[${val}]`,
    });
  }
})();
