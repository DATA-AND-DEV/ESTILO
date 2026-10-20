(()=>{
  const ctx={person:'1',channel:1,admin:true,write:true};
  const request=r=>JSON.parse(aoPedir(JSON.stringify(ctx),JSON.stringify(r)));
  const check=r=>{if(!r.ok)throw Error(r.error);return r;};
  const initial=check(request({op:'view'}));
  if(kind==='estilo'){
    // A recusa de um campo diz qual campo, e o caminho dela também roda aqui.
    const recusa=request({op:'save',revision:0,theme:{...initial.theme,text:initial.theme.background}});
    if(recusa.ok||Object.keys(recusa.erros||{}).join()!=='text,background,panel')throw Error('recusa sem erros por campo: '+JSON.stringify(recusa));
    check(request({op:'save',revision:0,theme:initial.theme}));
    if(request({op:'view'}).revision!==1)throw Error('persistência');
    // A API 6: o tema publicado é declarado ao servidor, na forma da API, e as
    // janelas são avisadas com a revisão.
    if(__declarados.length!==1||__declarados[0].modo!=='escuro'||__declarados[0].fundo!==initial.theme.background)throw Error('o tema não foi declarado: '+JSON.stringify(__declarados));
    if(JSON.stringify(__avisos)!=='[{"carga":{"revision":1}}]')throw Error('as janelas não foram avisadas: '+JSON.stringify(__avisos));
    check(request({op:'reset',revision:1}));
    if(__declarados.length!==2||__declarados[1]!==null)throw Error('restaurar não tirou o tema do servidor');
  }else{
    check(request({op:'save',revision:0,profile:{displayName:'Aurora',pronouns:'',bio:'Teste',status:'',accent:'#f2521f',effect:'sparkle'}}));
    const image='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const upload=check(request({op:'upload-start',slot:'banner',length:image.length}));
    check(request({op:'upload-part',token:upload.token,index:0,part:image}));
    if(request({op:'asset',person:'1',slot:'banner'}).image!==image)throw Error('imagem');
    check(request({op:'clear-image',revision:2,slot:'banner'}));
    check(request({op:'view'}));
  }
  return 'OK — runtime QuickJS, memória limitada a 8 MiB';
})()
