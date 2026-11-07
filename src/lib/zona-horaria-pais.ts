/**
 * LA HORA LOCAL A LA QUE EMPIEZA UN DÍA DE CAMPAÑA (Fase 9 · P10) — puro.
 *
 * Los días de la publicidad son días UTC (ocupación, cobro, métricas): empiezan a las 00:00 UTC. Para
 * una empresa eso es jerga, y además engaña: en Colombia el «día 7» empieza el 6 a las 19:00. Así que
 * el portal no dice «UTC»: dice a qué hora de SU país empieza cada día, calculada de la zona horaria
 * principal de su país, con su horario de verano (la hora cambia con la fecha).
 *
 * ┌─ DE DÓNDE SALE LA TABLA ───────────────────────────────────────────────────────────────────────┐
 * │ Generada de GeoNames (`cities15000.txt`, el mismo origen que el catálogo de ciudades de P5): la │
 * │ zona horaria de la CAPITAL de cada país (la ciudad marcada PPLC; si GeoNames no marca ninguna,  │
 * │ la de la ciudad más poblada). Un país que no está (territorios sin ninguna ciudad de 15.000      │
 * │ habitantes) no tiene frase: mejor callar la hora que inventarla.                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * PAÍSES CON VARIAS ZONAS (sus ciudades usan más de un desfase, en enero o en julio): «en tu hora
 * local» sería falso para parte de ellos, así que se dice cuál se usa —la de la capital— por su nombre
 * en castellano: «hora de Ciudad de México». La lista también sale de GeoNames; los nombres, no
 * (GeoNames los da en inglés): están escritos aquí, y un test exige que no falte ninguno.
 *
 * Usa `Intl`, así que se calcula en el SERVIDOR y la página recibe la frase hecha: el ICU de Node y el
 * de Chrome no siempre coinciden, y una hora distinta en cada lado rompe la hidratación.
 */

/** País (ISO 3166-1 alfa-2) → zona horaria IANA de su capital. Generada de GeoNames; no se edita a mano. */
export const ZONA_HORARIA_PAIS: Readonly<Record<string, string>> = {
  AD: "Europe/Andorra",
  AE: "Asia/Dubai",
  AF: "Asia/Kabul",
  AG: "America/Antigua",
  AI: "America/Anguilla",
  AL: "Europe/Tirane",
  AM: "Asia/Yerevan",
  AO: "Africa/Luanda",
  AR: "America/Argentina/Buenos_Aires",
  AS: "Pacific/Pago_Pago",
  AT: "Europe/Vienna",
  AU: "Australia/Sydney",
  AW: "America/Aruba",
  AX: "Europe/Mariehamn",
  AZ: "Asia/Baku",
  BA: "Europe/Sarajevo",
  BB: "America/Barbados",
  BD: "Asia/Dhaka",
  BE: "Europe/Brussels",
  BF: "Africa/Ouagadougou",
  BG: "Europe/Sofia",
  BH: "Asia/Bahrain",
  BI: "Africa/Bujumbura",
  BJ: "Africa/Porto-Novo",
  BL: "America/St_Barthelemy",
  BM: "Atlantic/Bermuda",
  BN: "Asia/Brunei",
  BO: "America/La_Paz",
  BQ: "America/Kralendijk",
  BR: "America/Sao_Paulo",
  BS: "America/Nassau",
  BT: "Asia/Thimphu",
  BW: "Africa/Gaborone",
  BY: "Europe/Minsk",
  BZ: "America/Belize",
  CA: "America/Toronto",
  CC: "Indian/Cocos",
  CD: "Africa/Kinshasa",
  CF: "Africa/Bangui",
  CG: "Africa/Brazzaville",
  CH: "Europe/Zurich",
  CI: "Africa/Abidjan",
  CK: "Pacific/Rarotonga",
  CL: "America/Santiago",
  CM: "Africa/Douala",
  CN: "Asia/Shanghai",
  CO: "America/Bogota",
  CR: "America/Costa_Rica",
  CU: "America/Havana",
  CV: "Atlantic/Cape_Verde",
  CW: "America/Curacao",
  CX: "Indian/Christmas",
  CY: "Asia/Nicosia",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DJ: "Africa/Djibouti",
  DK: "Europe/Copenhagen",
  DM: "America/Dominica",
  DO: "America/Santo_Domingo",
  DZ: "Africa/Algiers",
  EC: "America/Guayaquil",
  EE: "Europe/Tallinn",
  EG: "Africa/Cairo",
  EH: "Africa/El_Aaiun",
  ER: "Africa/Asmara",
  ES: "Europe/Madrid",
  ET: "Africa/Addis_Ababa",
  FI: "Europe/Helsinki",
  FJ: "Pacific/Fiji",
  FK: "Atlantic/Stanley",
  FM: "Pacific/Pohnpei",
  FO: "Atlantic/Faroe",
  FR: "Europe/Paris",
  GA: "Africa/Libreville",
  GB: "Europe/London",
  GD: "America/Grenada",
  GE: "Asia/Tbilisi",
  GF: "America/Cayenne",
  GG: "Europe/Guernsey",
  GH: "Africa/Accra",
  GI: "Europe/Gibraltar",
  GL: "America/Nuuk",
  GM: "Africa/Banjul",
  GN: "Africa/Conakry",
  GP: "America/Guadeloupe",
  GQ: "Africa/Malabo",
  GR: "Europe/Athens",
  GS: "Atlantic/South_Georgia",
  GT: "America/Guatemala",
  GU: "Pacific/Guam",
  GW: "Africa/Bissau",
  GY: "America/Guyana",
  HK: "Asia/Hong_Kong",
  HN: "America/Tegucigalpa",
  HR: "Europe/Zagreb",
  HT: "America/Port-au-Prince",
  HU: "Europe/Budapest",
  ID: "Asia/Jakarta",
  IE: "Europe/Dublin",
  IL: "Asia/Jerusalem",
  IM: "Europe/Isle_of_Man",
  IN: "Asia/Kolkata",
  IQ: "Asia/Baghdad",
  IR: "Asia/Tehran",
  IS: "Atlantic/Reykjavik",
  IT: "Europe/Rome",
  JE: "Europe/Jersey",
  JM: "America/Jamaica",
  JO: "Asia/Amman",
  JP: "Asia/Tokyo",
  KE: "Africa/Nairobi",
  KG: "Asia/Bishkek",
  KH: "Asia/Phnom_Penh",
  KI: "Pacific/Tarawa",
  KM: "Indian/Comoro",
  KN: "America/St_Kitts",
  KP: "Asia/Pyongyang",
  KR: "Asia/Seoul",
  KW: "Asia/Kuwait",
  KY: "America/Cayman",
  KZ: "Asia/Almaty",
  LA: "Asia/Vientiane",
  LB: "Asia/Beirut",
  LC: "America/St_Lucia",
  LI: "Europe/Vaduz",
  LK: "Asia/Colombo",
  LR: "Africa/Monrovia",
  LS: "Africa/Maseru",
  LT: "Europe/Vilnius",
  LU: "Europe/Luxembourg",
  LV: "Europe/Riga",
  LY: "Africa/Tripoli",
  MA: "Africa/Casablanca",
  MC: "Europe/Monaco",
  MD: "Europe/Chisinau",
  ME: "Europe/Podgorica",
  MF: "America/Marigot",
  MG: "Indian/Antananarivo",
  MH: "Pacific/Majuro",
  MK: "Europe/Skopje",
  ML: "Africa/Bamako",
  MM: "Asia/Yangon",
  MN: "Asia/Ulaanbaatar",
  MO: "Asia/Macau",
  MP: "Pacific/Saipan",
  MQ: "America/Martinique",
  MR: "Africa/Nouakchott",
  MS: "America/Montserrat",
  MT: "Europe/Malta",
  MU: "Indian/Mauritius",
  MV: "Indian/Maldives",
  MW: "Africa/Blantyre",
  MX: "America/Mexico_City",
  MY: "Asia/Kuala_Lumpur",
  MZ: "Africa/Maputo",
  NA: "Africa/Windhoek",
  NC: "Pacific/Noumea",
  NE: "Africa/Niamey",
  NF: "Pacific/Norfolk",
  NG: "Africa/Lagos",
  NI: "America/Managua",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  NP: "Asia/Kathmandu",
  NR: "Pacific/Nauru",
  NU: "Pacific/Niue",
  NZ: "Pacific/Auckland",
  OM: "Asia/Muscat",
  PA: "America/Panama",
  PE: "America/Lima",
  PF: "Pacific/Tahiti",
  PG: "Pacific/Port_Moresby",
  PH: "Asia/Manila",
  PK: "Asia/Karachi",
  PL: "Europe/Warsaw",
  PM: "America/Miquelon",
  PN: "Pacific/Pitcairn",
  PR: "America/Puerto_Rico",
  PS: "Asia/Hebron",
  PT: "Europe/Lisbon",
  PW: "Pacific/Palau",
  PY: "America/Asuncion",
  QA: "Asia/Qatar",
  RE: "Indian/Reunion",
  RO: "Europe/Bucharest",
  RS: "Europe/Belgrade",
  RU: "Europe/Moscow",
  RW: "Africa/Kigali",
  SA: "Asia/Riyadh",
  SB: "Pacific/Guadalcanal",
  SC: "Indian/Mahe",
  SD: "Africa/Khartoum",
  SE: "Europe/Stockholm",
  SG: "Asia/Singapore",
  SH: "Atlantic/St_Helena",
  SI: "Europe/Ljubljana",
  SJ: "Arctic/Longyearbyen",
  SK: "Europe/Bratislava",
  SL: "Africa/Freetown",
  SM: "Europe/San_Marino",
  SN: "Africa/Dakar",
  SO: "Africa/Mogadishu",
  SR: "America/Paramaribo",
  SS: "Africa/Juba",
  ST: "Africa/Sao_Tome",
  SV: "America/El_Salvador",
  SX: "America/Lower_Princes",
  SY: "Asia/Damascus",
  SZ: "Africa/Mbabane",
  TC: "America/Grand_Turk",
  TD: "Africa/Ndjamena",
  TF: "Indian/Kerguelen",
  TG: "Africa/Lome",
  TH: "Asia/Bangkok",
  TJ: "Asia/Dushanbe",
  TL: "Asia/Dili",
  TM: "Asia/Ashgabat",
  TN: "Africa/Tunis",
  TO: "Pacific/Tongatapu",
  TR: "Europe/Istanbul",
  TT: "America/Port_of_Spain",
  TV: "Pacific/Funafuti",
  TW: "Asia/Taipei",
  TZ: "Africa/Dar_es_Salaam",
  UA: "Europe/Kyiv",
  UG: "Africa/Kampala",
  US: "America/New_York",
  UY: "America/Montevideo",
  UZ: "Asia/Tashkent",
  VA: "Europe/Vatican",
  VC: "America/St_Vincent",
  VE: "America/Caracas",
  VG: "America/Tortola",
  VI: "America/St_Thomas",
  VN: "Asia/Bangkok",
  VU: "Pacific/Efate",
  WF: "Pacific/Wallis",
  WS: "Pacific/Apia",
  XK: "Europe/Belgrade",
  YE: "Asia/Aden",
  YT: "Indian/Mayotte",
  ZA: "Africa/Johannesburg",
  ZM: "Africa/Lusaka",
  ZW: "Africa/Harare",
};

/**
 * Los países con VARIAS zonas horarias y el nombre de su capital, cuya hora se usa. Los códigos salen de
 * GeoNames (ver la cabecera); los nombres, en castellano, se escriben aquí.
 */
export const CAPITAL_DE_PAIS_CON_VARIAS_ZONAS: Readonly<Record<string, string>> = {
  AU: "Canberra",
  BR: "Brasilia",
  CA: "Ottawa",
  CD: "Kinsasa",
  CL: "Santiago",
  CN: "Pekín",
  ES: "Madrid",
  GE: "Tiflis",
  ID: "Yakarta",
  MN: "Ulán Bator",
  MX: "Ciudad de México",
  PG: "Port Moresby",
  PT: "Lisboa",
  RU: "Moscú",
  UA: "Kiev",
  US: "Washington",
};

/**
 * CUÁNDO EMPIEZA, en local, el día UTC `dia` en el país: la hora («19:00», «1:00», «5:30») y si cae en
 * el DÍA ANTERIOR (toda América: el «día 7» empieza el 6 por la tarde). `null` si no se sabe la zona.
 * Con desfases de −12 a +14 h, las 00:00 UTC caen el mismo día o el anterior, nunca el siguiente.
 */
export function inicioLocalDelDia(
  paisIso: string,
  dia: Date,
): { hora: string; diaAnterior: boolean } | null {
  const zona = ZONA_HORARIA_PAIS[paisIso.trim().toUpperCase()];
  if (!zona) return null;
  const fecha = dia.toISOString().slice(0, 10);
  const inicio = new Date(`${fecha}T00:00:00.000Z`);
  try {
    const partes = new Intl.DateTimeFormat("es-ES", {
      timeZone: zona,
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(inicio);
    const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
    const [hora, minuto, diaLocal] = [valor("hour"), valor("minute"), valor("day")];
    if (hora === undefined || minuto === undefined || diaLocal === undefined) return null;
    return {
      hora: `${Number(hora)}:${minuto}`,
      diaAnterior: Number(diaLocal) !== inicio.getUTCDate(),
    };
  } catch {
    return null;
  }
}

/** Solo la hora local a la que empieza el día (ver `inicioLocalDelDia`). */
export function horaLocalDeInicio(paisIso: string, dia: Date): string | null {
  return inicioLocalDelDia(paisIso, dia)?.hora ?? null;
}

/**
 * LA FRASE para el formulario y la ficha de la campaña, o `null` si no se sabe la zona del país (mejor
 * no decir nada que decir una hora inventada). «a la 1:00» y «a las 19:00»: la una es singular. Y si
 * cae en la víspera, se dice («del día anterior»): «empieza a las 19:00» a secas se leería como las 19:00
 * del mismo día, y el anuncio ya llevaría cinco horas fuera.
 */
export function fraseInicioDelDia(paisIso: string, dia: Date): string | null {
  const inicio = inicioLocalDelDia(paisIso, dia);
  if (!inicio) return null;
  const articulo = inicio.hora.startsWith("1:") ? "a la" : "a las";
  const cuando = `${articulo} ${inicio.hora}${inicio.diaAnterior ? " del día anterior" : ""}`;
  const capital = CAPITAL_DE_PAIS_CON_VARIAS_ZONAS[paisIso.trim().toUpperCase()];
  return capital
    ? `Cada día de campaña empieza ${cuando}, hora de ${capital}.`
    : `Cada día de campaña empieza ${cuando}${inicio.diaAnterior ? "," : ""} en tu hora local.`;
}
