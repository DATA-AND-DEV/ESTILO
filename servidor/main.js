/* SEELE ESTILO — a metade de servidor, na API 6: guarda o tema, o declara ao servidor e avisa as janelas. Sem dependências e sem rede. */
(() => {
  'use strict';
  // A aparência com que o SEELE abre (`tokens.css`): `--seele-linha` é #241f19, e
  // as células de 8 × 16 px são a densidade `confortavel` da API de tema.
  const defaults = { accent:'#f2521f', background:'#050403', panel:'#0a0806', text:'#eae3cf', muted:'#908574', border:'#241f19', radius:0, density:'comfortable', font:'mono', glow:false };
  const colorKeys = ['accent','background','panel','text','muted','border'];
  // `erros` diz à janela onde pôr a recusa e por quê: a `chave` do controle e um
  // motivo curto, para quem usa (a forma do `formulario.erros` da API 6,
  // combinada entre os MODs oficiais). A recusa que não é de um campo, como a de
  // permissão e a de revisão, não o leva.
  function fail(message, erros) { const erro=new Error(message); if (erros) erro.erros=erros; throw erro; }
  const nomes = { text:'texto', muted:'texto apagado', accent:'destaque', background:'o fundo', panel:'o painel' };
  function luminance(hex) {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  }
  function contrast(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
  function validate(raw) {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) fail('Tema inválido.');
    const out={};
    for (const key of colorKeys) { if (!/^#[0-9a-f]{6}$/i.test(raw[key] || '')) fail('Use cores hexadecimais de seis dígitos.',{[key]:'uma cor #rrggbb'}); out[key]=raw[key].toLowerCase(); }
    // Todos os campos dos pares que falham, e não só os do primeiro: corrigir um
    // e descobrir o seguinte na próxima tentativa seria uma recusa de cada vez.
    // Um campo que está em dois pares fica com o motivo do primeiro.
    const erros={};
    for (const foreground of ['text','muted','accent']) for (const background of ['background','panel']) {
      const razao=contrast(out[foreground],out[background]);
      if (razao >= 4.5) continue;
      const motivo=nomes[foreground]+' sobre '+nomes[background]+' dá '+razao.toFixed(2).replace('.',',')+':1, e precisa de 4,5:1';
      for (const campo of [foreground,background]) if (!(campo in erros)) erros[campo]=motivo;
    }
    if (Object.keys(erros).length) fail('Contraste insuficiente: ajuste texto, texto secundário ou destaque sobre os fundos (mínimo 4,5:1).',erros);
    if (!Number.isInteger(raw.radius) || raw.radius<0 || raw.radius>24) fail('Arredondamento deve estar entre 0 e 24.',{radius:'um inteiro de 0 a 24'});
    if (!['comfortable','compact'].includes(raw.density)) fail('Opção de aparência inválida.',{density:'compacta ou confortável'});
    if (!['sans','mono'].includes(raw.font)) fail('Opção de aparência inválida.',{font:'monoespaçada ou sem serifa'});
    if (typeof raw.glow!=='boolean') fail('Opção de aparência inválida.',{glow:'sim ou não'});
    return {...out,radius:raw.radius,density:raw.density,font:raw.font,glow:raw.glow};
  }
  // O modo segue o fundo, pela conta do produto (`modo_do_fundo`, em
  // seele-proto): claro de 0,18 de luminância relativa para cima. O servidor
  // recusa um modo que discorda do fundo, então ele não é escolha de ninguém.
  function modo(fundo) {
    const canal=i=>{ const c=parseInt(fundo.slice(i,i+2),16)/255; return c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
    return 0.2126*canal(1)+0.7152*canal(3)+0.0722*canal(5) >= 0.18 ? 'claro' : 'escuro';
  }
  // O tema na forma da API 6 (`tema.nomes`), a partir dos nomes que o quintal
  // guarda desde a 1.0.0.
  const paraOProduto = t => ({ fundo:t.background, painel:t.panel, texto:t.text, apagado:t.muted, acento:t.accent, borda:t.border,
    densidade:t.density==='comfortable'?'confortavel':'compacta', fonte:t.font==='sans'?'sans':'mono',
    arredondamento:t.radius, brilho:t.glow, modo:modo(t.background) });
  // A chave da API de volta à do ESTILO, para uma recusa ir ao campo certo. O
  // modo não tem campo: ele vem do fundo.
  const doProduto = { fundo:'background', painel:'panel', texto:'text', apagado:'muted', acento:'accent', borda:'border',
    densidade:'density', fonte:'font', arredondamento:'radius', brilho:'glow', modo:'background' };
  // **Declarar o tema ao servidor** (`mundo.tema`). A recusa é valor, nunca
  // exceção. A forma, o servidor confere; o contraste, cada janela, e por isso
  // o ESTILO confere o dele antes (`validate`).
  function declarar(valores) {
    const r = mundo.tema(valores);
    if (r && r.ok === true) return;
    const erro = (r && r.erro) || 'sem-resposta';
    if (erro==='tema-de-outro-mod') fail('A aparência deste servidor é de outro MOD. Quem administra escolhe qual na gestão de MODs.');
    const campo = r && doProduto[r.chave];
    fail('O SEELE recusou o tema ('+erro+(r && r.chave ? ' em «'+r.chave+'»' : '')+').',
      campo ? { [campo]: 'o SEELE recusou ('+erro+')' } : undefined);
  }
  globalThis.aoPedir=(contextJSON,requestJSON)=>{
    try {
      const ctx=JSON.parse(contextJSON),r=JSON.parse(requestJSON);
      if (!ctx.person) fail('Sessão inválida.');
      let state=dados.theme ? JSON.parse(dados.theme) : { revision:0,theme:defaults,enabled:false };
      let declaracao;
      if (r.op==='view') {
        // **Depois da subida do Servidor 0.15 para o 1.0**, o quintal vem
        // inteiro, mas o tema guardado pelo servidor é novo na 6 e começa
        // vazio. O primeiro a entrar redeclara o que quem administra publicou;
        // `dados.declarado` é a revisão que o servidor já tem.
        if (state.enabled && dados.declarado!==String(state.revision)) {
          const res = mundo.tema(paraOProduto(state.theme));
          if (res && res.ok===true) dados.declarado=String(state.revision);
          else declaracao={ ok:false, erro:(res && res.erro) || 'sem-resposta', ...(res && res.chave ? { chave:res.chave } : {}) };
        }
      } else {
        if (ctx.admin!==true) fail('Somente o host ou administrador pode mudar o tema.');
        if (r.revision!==state.revision) fail('O tema mudou em outro computador. Recarregue antes de salvar.');
        // Validar, declarar, e só então gravar: um tema que o servidor recusa
        // não entra no quintal.
        if (r.op==='save') { const theme=validate(r.theme); declarar(paraOProduto(theme)); state={revision:state.revision+1,theme,enabled:true}; }
        else if (r.op==='reset') { declarar(null); state={revision:state.revision+1,theme:defaults,enabled:false}; }
        else fail('Operação desconhecida.');
        dados.theme=JSON.stringify(state);
        dados.declarado=String(state.revision);
        // A carga é a revisão: a janela pede o estado só se ela for maior.
        mundo.avisar({ carga:{ revision:state.revision } });
      }
      return JSON.stringify({ok:true,...state,canEdit:ctx.admin===true,...(declaracao?{declaracao}:{})});
    } catch(e) { return JSON.stringify({ok:false,error:e.message,...(e.erros?{erros:e.erros}:{})}); }
  };
})();
