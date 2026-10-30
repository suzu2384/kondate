/**
 * The Google Calendar UI may hide observances, but Calendar API events.list
 * returns a calendar feed independently of those client UI preferences.
 * The holiday-only and combined Japanese feeds have distinct public IDs.
 * Retain the selected calendar ID in the app for colors and saved settings.
 */
export const JAPANESE_HOLIDAYS_ALL='ja.japanese#holiday@group.v.calendar.google.com';
export const JAPANESE_HOLIDAYS_OFFICIAL='ja.japanese.official#holiday@group.v.calendar.google.com';
const LEGACY_JAPANESE_HOLIDAYS='japanese__ja@holiday.calendar.google.com';
const IDS=[JAPANESE_HOLIDAYS_ALL,JAPANESE_HOLIDAYS_OFFICIAL,LEGACY_JAPANESE_HOLIDAYS];
export const JAPANESE_HOLIDAY_SELECTIONS=Object.freeze(['official','all']);
export function isJapaneseHolidayCalendarId(id){
 return IDS.includes(id);
}
export function normalizeJapaneseHolidaySelection(value){
 return value==='all'?'all':'official';
}
export function validateJapaneseHolidaySelection(value){
 if(!JAPANESE_HOLIDAY_SELECTIONS.includes(value))
  throw Error('日本の祝日カレンダーの表示内容が不正です。');
}
export function holidayEventSourceId(calendarId,selection='official'){
 if(!isJapaneseHolidayCalendarId(calendarId))return calendarId;
 return normalizeJapaneseHolidaySelection(selection)==='all'?
  JAPANESE_HOLIDAYS_ALL:JAPANESE_HOLIDAYS_OFFICIAL;
}
