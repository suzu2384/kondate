export const colors={red:{name:'赤',light:'#9a4545',dark:'#ecaaaa'},yellow:{name:'黄',light:'#776016',dark:'#e2cd7d'},green:{name:'緑',light:'#436e57',dark:'#a4d3b3'},cyan:{name:'シアン',light:'#256c76',dark:'#8fd3dc'},blue:{name:'青',light:'#4167a1',dark:'#abc8f1'},magenta:{name:'マゼンタ',light:'#875081',dark:'#dcafda'},mono:{name:'無彩色',light:'#525b61',dark:'#c4cbd0'}};
// Tint the complete surface palette for each colour scheme.
export function applyTheme({color='green',mode='auto'}={}){
 const dark=mode==='dark'||(mode==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
 const palette=colors[color]||colors.green,accent=dark?palette.dark:palette.light;
 const mix=(amount,base)=>`color-mix(in srgb, ${accent} ${amount}%, ${base})`;
 const vars=dark?{
 bg:mix(10,'#101318'),surface:mix(12,'#1b2027'),panel:mix(18,'#282e37'),
 text:mix(7,'#f9fafc'),muted:mix(8,'#b9c1cc'),line:mix(20,'#444b55'),
 accent,'on-accent':'#14202a',tint:mix(23,'#26303a'),
 danger:'#ffaaa9',shadow:'0 6px 22px #00000026'}:{
 bg:mix(11,'#f7f8fb'),surface:mix(5,'#ffffff'),panel:mix(14,'#e9edf3'),
 text:mix(16,'#1b2531'),muted:mix(13,'#5c6774'),line:mix(18,'#d7dee7'),
 accent,'on-accent':'#fff',tint:mix(20,'#f0f3f8'),
 danger:'#a53940',shadow:'0 5px 18px #182c4110'};
 for(const [key,value] of Object.entries(vars))document.documentElement.style.setProperty('--'+key,value);
 document.documentElement.style.colorScheme=dark?'dark':'light';
 document.documentElement.dataset.themeMode=dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=vars.bg;
}
