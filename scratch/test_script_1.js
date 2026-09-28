
/* ============================================================
   CYBER PARTICLE BACKGROUND (from Landing page design)
   ============================================================ */
(function(){
  const canvas = document.getElementById('cyberCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particleCount = 65;
  let particles = [];

  function resizeCanvas(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class Particle{
    constructor(){
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = (Math.random() - 0.5) * 1.2;
      this.radius = Math.random() * 2 + 1;
      this.color = Math.random() > 0.3 ? '#38bdf8' : '#e056fd';
    }
    update(){
      this.x += this.vx; this.y += this.vy;
      if(this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if(this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    draw(){
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fill();
    }
  }
  for(let i = 0; i < particleCount; i++) particles.push(new Particle());

  function animate(){
    if(document.body.classList.contains('matrix-on')){ if(!reduce) requestAnimationFrame(animate); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i = 0; i < particles.length; i++){
      for(let j = i + 1; j < particles.length; j++){
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 130){
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(56, 189, 248, ${1 - dist / 130})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    particles.forEach(p => { if(!reduce) p.update(); p.draw(); });
    if(!reduce) requestAnimationFrame(animate);
  }
  animate();
})();
