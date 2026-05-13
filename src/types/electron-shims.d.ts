declare module "electron" {
  export const app: {
    setName(name: string): void;
    setAboutPanelOptions?(options: any): void;
    dock?: {
      setIcon(icon: string): void;
    };
    setDesktopName?(name: string): void;
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
  };

  export const Menu: {
    buildFromTemplate(template: any[]): any;
    setApplicationMenu(menu: any): void;
  };

  export class BrowserWindow {
    constructor(options?: any);
    loadFile(path: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    setTitle?(title: string): void;
    setIcon?(icon: any): void;
    webContents: {
      send(channel: string, ...args: any[]): void;
      focus(): void;
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

  export const nativeImage: {
    createFromPath(path: string): {
      isEmpty(): boolean;
    };
  };
}
