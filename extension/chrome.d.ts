interface AuditExtensionPort {
  name: string;
  postMessage(message: unknown): void; disconnect(): void;
  onMessage: { addListener(listener: (message: any) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}
declare const chrome: {
  action: { onClicked: { addListener(listener: (tab: { id?: number; url?: string }) => void): void } };
  scripting: { executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown> };
  windows: { create(options: { url: string; type: 'popup'; width: number; height: number }): Promise<unknown> };
  runtime: {
    getURL(path: string): string;
    onConnect: { addListener(listener: (port: AuditExtensionPort) => void): void };
  };
  tabs: { connect(tabId: number, options: { name: string }): AuditExtensionPort };
  permissions: { request(options: { origins: string[] }): Promise<boolean> };
};
