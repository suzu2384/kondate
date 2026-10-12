import {setFaviconBackground} from './theme-favicon.js';
/** Background of the KonDate home icon (icons/icon.svg). */
export const APP_CHROME_COLOR='#FBF8F4';
export const colors={
 // The seven original IDs, shades and preferences are preserved.
 red:{name:'赤（暗め）',light:'#9a4545',dark:'#ecaaaa'},
 yellow:{name:'黄（暗め）',light:'#776016',dark:'#e2cd7d'},
 green:{name:'緑（暗め）',light:'#436e57',dark:'#a4d3b3'},
 cyan:{name:'シアン（暗め）',light:'#256c76',dark:'#8fd3dc'},
 blue:{name:'青（暗め）',light:'#4167a1',dark:'#abc8f1'},
 magenta:{name:'マゼンタ（暗め）',light:'#875081',dark:'#dcafda'},
 mono:{name:'無彩色（暗め）',light:'#525b61',dark:'#c4cbd0'},
 // Lighter and clearer *accent* colors, one counterpart per original hue.
 'red-rich':{name:'赤（明るめ）',light:'#c62828',dark:'#ff6868',rich:true},
 'yellow-rich':{name:'黄（明るめ）',light:'#8c6700',dark:'#ffe04a',rich:true},
 'green-rich':{name:'緑（明るめ）',light:'#0b7b3e',dark:'#49db65',rich:true},
 'cyan-rich':{name:'シアン（明るめ）',light:'#007a97',dark:'#43d1ec',rich:true},
 'blue-rich':{name:'青（明るめ）',light:'#245dc7',dark:'#69a2ff',rich:true},
 'magenta-rich':{name:'マゼンタ（明るめ）',light:'#a221a8',dark:'#eb68ed',rich:true},
 'mono-rich':{name:'無彩色（明るめ）',light:'#42525f',dark:'#e5edf7',rich:true}
};
// Previous releases offered four additional colors. Reconcile saved selections
// and older Drive backups to the nearest supported original hue.
export const retiredThemeColors={
 'orange-rich':'red-rich','lime-rich':'green-rich',
 'purple-rich':'magenta-rich','pink-rich':'red-rich'
};
export function normalizeThemeColor(color){
 return Object.hasOwn(colors,color)?color:retiredThemeColors[color]||'green';
}
export function isSupportedThemeColor(color){
 return Object.hasOwn(colors,color)||Object.hasOwn(retiredThemeColors,color);
}
// A tone pair shares the exact same old background palette.
function backgroundPalette(color){
 const base=normalizeThemeColor(color).replace(/-rich$/,'');
 return colors[base]||colors.green;
}
/** Resolve the same sRGB background mix as the CSS theme into a browser-safe hex color. */
export function themeBackgroundColor({color='green',mode='auto'}={},prefersDark=false){
 const dark=mode==='dark'||(mode==='auto'&&prefersDark);
 const back=backgroundPalette(color);
 const fg=dark?back.dark:back.light,base=dark?'#0d1118':'#fbfcfe',fraction=dark?0.04:0.03;
 const toRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return '#'+toRgb(fg).map((channel,i)=>Math.round(channel*fraction+toRgb(base)[i]*(1-fraction)).toString(16).padStart(2,'0')).join('');
}
// Shared accessible accent colors; light and dark use independently tuned surface palettes.
export function applyTheme({color='green',mode='auto'}={}){
 const dark=mode==='dark'||(mode==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
 const selected=colors[normalizeThemeColor(color)];
 const basePalette=backgroundPalette(color);
 const accent=dark?selected.dark:selected.light;
 // Everything other than --accent remains *identical* to the original theme:
 // ordinary text, secondary labels, cards, lines, tint and background.
 const baseAccent=dark?basePalette.dark:basePalette.light;
 const mix=(amount,base)=>`color-mix(in srgb, ${baseAccent} ${amount}%, ${base})`;
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
 const chromeColor=themeBackgroundColor({color,mode},dark);
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=chromeColor;
 // Browser tab favicon only: the SVG geometry and logo colors are retained.
 // A network/cache failure leaves the committed favicon as a usable fallback.
 void setFaviconBackground(chromeColor).catch(()=>{});
}
