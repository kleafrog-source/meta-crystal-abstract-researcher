declare module "socket.io-client" {
  export function io(...args: any[]): any;
}

declare module "socket.io" {
  export class Server {
    constructor(...args: any[]);
    on(...args: any[]): any;
    emit(...args: any[]): any;
  }
}
