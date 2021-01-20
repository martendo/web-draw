const Rect = {
  draw(rect, ctx, user = true) {
    const x = rect.lineWidth % 2 !== 0 ? rect.x + 0.5 : rect.x;
    const y = rect.lineWidth % 2 !== 0 ? rect.y + 0.5 : rect.y;
    
    ctx.globalAlpha = rect.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[rect.compOp];
    
    if (rect.fill) {
      ctx.fillStyle = rect.colours.fill;
      ctx.fillRect(x, y, rect.width, rect.height);
    }
    if (rect.outline) {
      ctx.strokeStyle = rect.colours.outline;
      ctx.lineWidth = rect.lineWidth;
      ctx.strokeRect(x, y, rect.width, rect.height);
    }
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};
