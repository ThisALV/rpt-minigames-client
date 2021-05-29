import { Injectable } from '@angular/core';
import { RuntimeErrorsService } from './runtime-errors.service';


/**
 * Resolves a game server host with given port number and current hostname.
 *
 * For example, a port of 35555 with an URL of https://rpt-minigames.com/ would become wss://rpt-minigames.com:35555/.
 */
@Injectable({
  providedIn: 'root'
})
export class GameServerResolutionService {
  private readonly protocol: string;
  private readonly hostname: string;

  constructor(window: Window, errorHandler: RuntimeErrorsService) {
    switch (window.location.protocol) { // Parses current protocol only once to determines if secure connection is needed with game server
      case 'http:':
        this.protocol = 'ws';
        break;
      case 'https:':
        this.protocol = 'wss'; // Cannot connect to ws:// from https://, mixed protocols are forbidden
        break;
      default:
        errorHandler.throwError(`Unknown protocol to determine game servers URL: ${window.location.protocol}`);
        throw new URIError(`Unknown protocol: ${window.location.protocol}`);
    }

    this.hostname = window.location.hostname; // Saves hostname only once to formats game servers URL
  }

  /**
   * Formats, depending on current URL, game server Websocket address for given port.
   *
   * @param port Port inserted into address to connect to game server
   *
   * @returns Address for Websocket connection to game server, example: `wss://localhost:35555/` if current URL is
   * `https://localhost:35555/`
   */
  resolve(port: number): string {
    // Formats Websocket URL to keep the same SSL protection or not and the same hostname, changing the server port to get game server
    return `${this.protocol}://${this.hostname}:${port}/`;
  }
}
