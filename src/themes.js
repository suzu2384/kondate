export const colors={red:{name:'赤',light:'#9a4545',dark:'#ecaaaa'},yellow:{name:'黄',light:'#776016',dark:'#e2cd7d'},green:{name:'緑',light:'#436e57',dark:'#a4d3b3'},cyan:{name:'シアン',light:'#256c76',dark:'#8fd3dc'},blue:{name:'青',light:'#4167a1',dark:'#abc8f1'},magenta:{name:'マゼンタ',light:'#875081',dark:'#dcafda'},mono:{name:'無彩色',light:'#525b61',dark:'#c4cbd0'}};
// Shared accessible accent colors; light and dark use independently tuned surface palettes.
export function applyTheme({color='green',mode='auto'}={}){
 const dark=mode==='dark'||(mode==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
 const palette=colors[color]||colors.green,accent=dark?palette.dark:palette.light;
 const mix=(amount,base)=>`color-mix(in srgb, ${accent} ${amount}%, ${base})`;
 // Light is a near-white canvas with subtly coloured panels; don't tint the
 // entire surface as heavily as the accent. Dark deliberately layers three
 // distinct surfaces, so changing mode affects controls, cards and text too.
 const vars=dark?{
 bg:mix(4,'#0d1118'),surface:mix(8,'#1a222c'),panel:mix(11,'#273240'),
 text:mix(3,'#f4f7fb'),muted:mix(6,'#c1cbd5'),line:mix(15,'#495461'),
 accent,'on-accent':'#14202a',tint:mix(19,'#2b3544'),
 danger:'#ffaaa9',shadow:'0 8px 26px #00000045'}:{
 bg:mix(3,'#fbfcfe'),surface:mix(1,'#ffffff'),panel:mix(7,'#f5f8fc'),
 text:mix(8,'#172432'),muted:mix(8,'#5a6573'),line:mix(10,'#e2e8f0'),
 accent,'on-accent':'#fff',tint:mix(14,'#f4f8fc'),
 danger:'#a53940',shadow:'0 6px 22px #1b2c4010'};
 for(const [key,value] of Object.entries(vars))document.documentElement.style.setProperty('--'+key,value);
 document.documentElement.style.colorScheme=dark?'dark':'light';
 document.documentElement.dataset.themeMode=dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=vars.bg;
}
