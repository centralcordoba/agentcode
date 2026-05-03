import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.agentcode', 'config.json');

let currentLanguage = 'en';

export function configPath() {
  return CONFIG_PATH;
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export function setLanguage(lang) {
  if (lang !== 'en' && lang !== 'es') return false;
  currentLanguage = lang;
  return true;
}

export function getLanguage() {
  return currentLanguage;
}

export function languageName(lang = currentLanguage) {
  return lang === 'es' ? 'Spanish (Español)' : 'English';
}
