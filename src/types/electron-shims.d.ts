declare module "electron" {
  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
  };

  export class BrowserWindow {
    constructor(options?: any);
    loadFile(path: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    webContents: {
      send(channel: string, ...args: any[]): void;
      openDevTools(options?: any): void;
      on(event: string, listener: (...args: any[]) => void): void;
      executeJavaScript(code: string): Promise<any>;
    };
    getContentSize(): [number, number];
  }

  export const ipcMain: {
    handle(channel: string, listener: (...args: any[]) => any): void;
    removeHandler(channel: string): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (...args: any[]) => void): void;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: any): void;
  };
}
