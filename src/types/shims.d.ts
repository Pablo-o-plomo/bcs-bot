declare const process: any;
declare module 'dotenv' { const dotenv: { config: () => void }; export default dotenv; }
declare module 'dotenv/config';
declare module 'path' { const path: any; export default path; }
declare module 'fs' { const fs: any; export default fs; }
declare module 'node-cron' { const cron: { schedule: (expr: string, fn: () => void | Promise<void>) => void }; export default cron; }
declare module 'express' { const express: any; export default express; }
declare module 'winston' { const winston: any; export default winston; }
declare module 'node-telegram-bot-api' {
  class TelegramBot {
    constructor(token: string, options?: any);
    onText(regexp: RegExp, callback: (...args: any[]) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
    sendMessage(chatId: any, text: string, options?: any): Promise<any>;
    answerCallbackQuery(callbackQueryId: string, options?: any): Promise<any>;
  }
  namespace TelegramBot {
    type Message = any;
    type CallbackQuery = any;
    type SendMessageOptions = any;
  }
  export = TelegramBot;
}
declare const URLSearchParams: any;
declare module 'axios' {
  const axios: {
    post: <T = any>(url: string, data?: any, config?: any) => Promise<{ data: T }>;
    get: <T = any>(url: string, config?: any) => Promise<{ data: T }>;
  };
  export default axios;
}

declare module 'node:sqlite' { export const DatabaseSync: any; }
