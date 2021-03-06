import { Injectable } from '@angular/core';
import {
  ArgumentScheme,
  BadSerCommand,
  CommandParser,
  RptlProtocolService,
  RptlState,
  SerProtocolService,
  SerService
} from 'rpt-webapp-client';
import { Player } from './player';
import { Observable, Subject } from 'rxjs';
import { ActorsListService } from './actors-list.service';
import { filter } from 'rxjs/operators';


// Used to parse READY_PLAYER and WAITING_FOR_PLAYER commands arguments
const uidArgumentScheme: ArgumentScheme[] = [{ name: 'uid', type: Number }];


/**
 * Thrown by `LobbyService` methods if trying to perform an operation requiring an unmet specific Lobby state.
 */
export class BadLobbyState extends Error {
  constructor(message: string) {
    super(message);
  }
}


/**
 * Provides data about Lobby and players state:
 * - Is the countdown before starting Minigame running?
 * - Who are the connected players? Are they ready to start?
 *
 * Data and states are automatically reset, including passing false to isStarting() and isPlaying(), when Lobby is quit by disconnection
 * from server.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class LobbyService extends SerService {
  // Set to true when BEGIN_COUNTDOWN is received, set to false when END_COUNTDOWN is received
  private readonly starting: Subject<boolean>;
  // Set to true when PLAYING is received, set to false when WAITING is received
  private readonly playing: Subject<boolean>;
  // Players dictionary translated into an array because it's easier to read for the component
  private readonly playersArray: Subject<Player[]>;

  // Will be updated with the actors list
  private players: { [actorUid: number]: Player };
  // Might not be defined if minigame isn't starting
  private currentCountdown?: number;

  constructor(stateProvider: RptlProtocolService, serProtocol: SerProtocolService, playersListProvider: ActorsListService) {
    super(serProtocol, 'Lobby'); // Registers Service into SER Protocol under the name Lobby used for SER commands

    this.players = {}; // No players until a list is provided by RptlProtocolService
    this.starting = new Subject<boolean>();
    this.playing = new Subject<boolean>();
    this.playersArray = new Subject<Player[]>();

    // Listen for updates in Lobby players list
    playersListProvider.getList().subscribe({
      next: (actorsList: number[]) => {
        this.updatePlayersList(actorsList); // Adapts players list to added/removed actors
        this.updatePlayersArraySubject(); // Pushes new array into subject
      }
    });

    // Listen for Lobby Service commands to handle them
    this.serviceSubject.subscribe({
      next: (lobbyCommand: string): void => this.handleCommand(lobbyCommand)
    });

    // When disconnected, must automatically reset data and states. Observes for DISCONNECTED state.
    stateProvider.getState().pipe(filter((newState: RptlState) => newState === RptlState.DISCONNECTED)).subscribe({
      next: () => this.reset()
    });
  }

  // Resets for new Lobby room on a new server
  private reset(): void {
    this.players = {};
    this.currentCountdown = undefined;
    this.starting.next(false);
    this.playing.next(false);
  }

  private handleCommand(lobbyCommand: string): void {
    // Parses which lobby command is invoked
    const parsedCommand = new CommandParser(lobbyCommand).parseTo([{ name: 'command', type: String }]);
    // Converts to primitive-type value
    const command: string = String(parsedCommand.parsedData.command);

    // Depending on Lobby Service invoked command
    switch (command) {
      case 'READY_PLAYER': { // Case scope blocks required because of parsedUid local const
        // 1 arg: player actor UID
        const parsedUid = parsedCommand.parseTo(uidArgumentScheme);
        this.players[parsedUid.parsedData.uid].isReady = true;
        this.updatePlayersArraySubject(); // Passes array with new data into subject

        break;
      } case 'WAITING_FOR_PLAYER': {
        // 1 arg: player actor UID
        const parsedUid = parsedCommand.parseTo(uidArgumentScheme);
        this.players[parsedUid.parsedData.uid].isReady = false;
        this.updatePlayersArraySubject(); // Passes array with new data into subject

        break;
      } case 'BEGIN_COUNTDOWN':
        // 1 arg: countdown delay in ms
        const parsedDelayMs = parsedCommand.parseTo([{ name: 'delayMs', type: Number }]);

        this.currentCountdown = parsedDelayMs.parsedData.delayMs; // Saves countdown
        this.starting.next(true); // Updates state: Lobby minigame is now starting, not started

        break;
      case 'END_COUNTDOWN':
        this.currentCountdown = undefined; // Makes countdown inaccessible as Lobby minigame is no longer starting
        this.starting.next(false);

        break;
      case 'PLAYING':
        this.playing.next(true); // Updates status: Lobby is currently busy with running minigame
        break;
      case 'WAITING':
        this.playing.next(false); // Updates status: Lobby is no longer busy with minigame because it stopped
        break;
      default:
        throw new BadSerCommand(`Unknown Lobby command: ${command}`);
    }
  }

  /// Checks for missing player or new player comparing to current Lobby players list, will remove missing player and add new player
  /// into initial state <=> not ready
  private updatePlayersList(actorsList: number[]): void {
    // Creates UIDs set, more adapted for the following algorithm which use by-unique-value search
    // Players dictionary UID keys are returned as string, must be reverted back to UID first
    const currentUids = new Set<number>(Object.keys(this.players).map((strUid: string) => Number(strUid)));
    const updatedUids = new Set<number>(actorsList);

    // Each current player no longer listed as an actor is removed from Lobby
    for (const playerUid of currentUids) {
      if (!updatedUids.has(playerUid)) {
        delete this.players[playerUid];
      }
    }

    // Each new actor which is not a player inside Lobby will become one, as not ready
    for (const actorUid of updatedUids) {
      if (!currentUids.has(actorUid)) {
        this.players[actorUid] = new Player(actorUid, false);
      }
    }
  }

  /**
   * Sends READY command to toggle client own player state.
   */
  toggleReady(): void {
    this.serviceSubject.next('READY');
  }

  /**
   * @returns Current countdown duration in milliseconds
   *
   * @throws BadLobbyState if Lobby minigame isn't starting
   */
  getCurrentCountdown(): number {
    if (this.currentCountdown === undefined) { // Checks for minigame to be starting
      throw new BadLobbyState('No current countdown, minigame is not starting');
    }

    return this.currentCountdown;
  }

  /**
   * @returns Observable for Lobby countdown state
   */
  isStarting(): Observable<boolean> {
    return this.starting;
  }

  /**
   * @returns Observable for Lobby busy state, if it is running a minigame or not
   */
  isPlaying(): Observable<boolean> {
    return this.playing;
  }

  /**
   * @returns Observable for updated array of data for every `Player` inside Lobby
   */
  getPlayers(): Observable<Player[]> {
    return this.playersArray;
  }

  /**
   * Converts current players dictionary into an array for passing it to `playersArrays` subject.
   *
   * This method is called by service at each players registry modifications, but it can also be called by user to force array to be
   * pushed again into subject.
   */
   updatePlayersArraySubject(): void {
    this.playersArray.next(Object.values(this.players)); // For the component which will read that, it's easier if it is an array
  }
}
