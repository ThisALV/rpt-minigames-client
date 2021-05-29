import { Availability } from 'rpt-webapp-client/lib/availability';


/**
 * Provides every server data a standard user should know about.
 */
export class GameServer {
  /**
   * Extended full name for RpT Minigame type if recognized, constructor parameter name otherwise
   */
  readonly gameName: string;

  /**
   * @param name Server name
   * @param gameType RpT Minigame, if a, b or c, will be extended respectively to Açores, Bermudes or Canaries
   * @param status Server status retrieved by STATUS RPTL command if any, otherwise it means RPTL connection failed
   */
  constructor(public readonly name: string, gameType: string, public readonly status?: Availability) {
    switch (gameType) {
      case 'a':
        this.gameName = 'Açores';
        break;
      case 'b':
        this.gameName = 'Bermudes';
        break;
      case 'c':
        this.gameName = 'Canaries';
        break;
      default:
        this.gameName = gameType;
    }
  }
}
