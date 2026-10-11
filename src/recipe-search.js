// Build a browser-native recipe search link without an API key or server.
export function recipeSearchUrl(dishName){
 const name=String(dishName??'').trim();
 if(!name)throw Error('料理名を入力してください。');
 return 'https://www.google.com/search?q='+encodeURIComponent(name+' レシピ');
}
