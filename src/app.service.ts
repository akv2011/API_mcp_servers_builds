import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║                                                                          ║
    ║                                                                          ║
    ║   ███╗   ███╗  █████╗  ████████╗██████╗ ██╗██╗  ██╗                     ║
    ║   ████╗ ████║ ██╔══██╗ ╚══██╔══╝██╔══██╗██║╚██╗██╔╝                     ║
    ║   ██╔████╔██║ ███████║    ██║   ██████╔╝██║ ╚███╔╝                      ║
    ║   ██║╚██╔╝██║ ██╔══██║    ██║   ██╔══██╗██║ ██╔██╗                      ║
    ║   ██║ ╚═╝ ██║ ██║  ██║    ██║   ██║  ██║██║██╔╝ ██╗                     ║
    ║   ╚═╝     ╚═╝ ╚═╝  ╚═╝    ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝                     ║
    ║                                                                          ║
    ║                                                                          ║
    ║   >> Wake up, developer...                                              ║
    ║   >> The API has you...                                                 ║
    ║   >> Follow the blockchain rabbit...                                    ║
    ║   >> Knock, knock, Neo.                                                 ║
    ║                                                                          ║
    ║                                                                          ║
    ╚══════════════════════════════════════════════════════════════════════════╝
    
    Welcome to the Matrix Financial System API - Version 2.0
    There is no spoon, only DeFi protocols.
    `;
  }
}
