const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function init() {
  console.log('Legion prototype initialized.');
  drawPlaceholder();
}

function drawPlaceholder() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f0';
  ctx.font = '20px sans-serif';
  ctx.fillText('Legion game prototype: loading...', 20, 40);
}

init();
