import WebsocketClient from '../websocket-client.mjs';

let wsc;

function init() {
  wsc = new WebsocketClient('/target');

  wsc.on('open', () => {
    console.log('wsc open');
    wsc.event('sync');
  });

  wsc.on('json', (con, event, data) => {
    if (event === 'sync') {
      drawingShapes = [];
      data.forEach((shape) => {
        const ds = new DrawingShape(shape);
        drawingShapes.push(ds);
      });
    } else if (event === 'newshape') {
      const ds = new DrawingShape();
      drawingShapes.push(ds);
    } else if (event === 'addpoint') {
      lastInputPoint = { x: data.x, y: data.y };

      const radius = Math.max(10, data.r);
      const currentShape = drawingShapes[drawingShapes.length - 1];
      if (currentShape) {
        currentShape.addPoint(data.x, data.y, radius);
      }
    } else if (event === 'refresh') {
      window.location.reload();
    }

    updateEntitiesFromShapes();
  });

  wsc.on('close', () => {
    console.log('wsc close');
  });

  wsc.on('error', (error) => {
    console.log('wsc error:', error);
  });

  wsc.open();
}

init();
