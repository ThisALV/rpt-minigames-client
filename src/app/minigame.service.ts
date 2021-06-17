import { Injectable } from '@angular/core';
import {
  ArgumentConverter,
  BadSerCommand,
  CommandParser,
  RptlProtocolService,
  RptlState,
  SerProtocolService,
  SerService
} from 'rpt-webapp-client';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { initialGrids, initialPawnCounts } from './initial-grids';
import { MinigameType, SquareState } from './minigame-enums';


/**
 * Thrown by `MinigameService` methods with their require a specific precondition which is not met.
 */
export class BadMinigameState extends Error {
  constructor(message: string) {
    super(message);
  }
}


/**
 * Data to identify a specific square inside grid, line and columns numbers both begin from 1.
 */
export type Coordinates = { lineNumber: number, columnNumber: number };

/**
 * Data for an action moving a pawn into a specific square into another square inside grid.
 */
export type PawnMovement = { from: Coordinates, to: Coordinates };

/**
 * Data for a single, non-movement `SquareState` update.
 */
export type SquareUpdate = { square: Coordinates, updatedState: SquareState };

/**
 * Represents the players currently playing to this minigame.
 */
export type PlayersConfiguration = { white: number, black: number };

/**
 * Represents number of pawns still owned by each player.
 */
export type PlayersPawnCounts = { white: number, black: number };


// Parses a given stringified state into a `SquareState` enum value.
class SquareStateParser {
  readonly enumValue?: SquareState; // Let undefined if could not be parsed, should NOT happen

  constructor(state: string) {
    switch (state) {
      case 'FREE':
        this.enumValue = SquareState.FREE;
        break;
      case 'BLACK':
        this.enumValue = SquareState.BLACK;
        break;
      case 'WHITE':
        this.enumValue = SquareState.WHITE;
        break;
    }
  }
}


/**
 * Provides initial grid for configurable current RpT Minigame, then notifies each `MOVED` and `SQUARE_STATE` grid updates, each player
 * pawns count and current game status using different subjects. Can interact with game server using `move()` to send a MOVE command
 * with given coordinates.
 *
 * At disconnection from server, state and data are automatically reset.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class MinigameService extends SerService {
  private readonly playerToUid: ArgumentConverter; // Used to returns an actor UID depending on instance assigned players
  private readonly winner: Subject<number>; // Actor UID passed each time a player wins
  private readonly started: Subject<boolean>; // true passed when game is running, false passed when a player wins
  private readonly movedPawns: Subject<PawnMovement>;
  private readonly updatedSquares: Subject<SquareUpdate>;
  private readonly pawnCounts: Subject<PlayersPawnCounts>;
  private readonly currentPlayer: Subject<number>; // Actor UID passed each time we go to the next player

  private currentMinigame: MinigameType; // We'll check for minigame type once isRunning() emits true, so we do not use subject for this val
  private players?: PlayersConfiguration; // Undefined if no minigame is running

  constructor(stateProvider: RptlProtocolService, serProtocol: SerProtocolService) {
    super(serProtocol, 'Minigame');

    const context: MinigameService = this;
    this.playerToUid = class { // It is an argument converter passed to the args scheme for parsing ROUND_FOR argument
      // UID for actor assigned to parsed player
      readonly uid?: number;

      constructor(player: string) {
        // We're not gonna try to parse this until we have two players assigned, we can use "as number"
        if (player === 'WHITE') {
          this.uid = context.players?.white as number;
        } else if (player === 'BLACK') {
          this.uid = context.players?.black as number;
        }
      }
    };

    this.winner = new Subject<number>();
    this.started = new Subject<boolean>();
    this.movedPawns = new Subject<PawnMovement>();
    this.updatedSquares = new Subject<SquareUpdate>();
    this.pawnCounts = new Subject<PlayersPawnCounts>();
    this.currentPlayer = new Subject<number>();

    // There should always be a current minigame type as long as we're registered into server, otherwise value isn't used, so we can put
    // a default value which doesn't actually matter
    this.currentMinigame = MinigameType.ACORES;

    // Listen for Minigame Service commands to handle them
    this.serviceSubject.subscribe({
      next: (minigameCommand: string): void => this.handleCommand(minigameCommand)
    });

    // At disconnection, no game could be possibly running: automatic stop & reset
    stateProvider.getState().pipe(filter((newState: RptlState) => newState === RptlState.DISCONNECTED)).subscribe({
      next: () => this.reset()
    });
  }

  // Resets state & data
  private reset(): void {
    this.started.next(false); // Notifies component no more game is running
    this.players = undefined; // Resets players data for the next room
  }

  private handleCommand(minigameCommand: string): void {
    // Parses which minigame command is invoked
    const parsedCommand = new CommandParser(minigameCommand).parseTo([{ name: 'command', type: String }]);
    // Converts to primitive-type value
    const command = String(parsedCommand.parsedData.command);

    // Depending on Minigame Service invoked command
    switch (command) {
      case 'START':
        // Parses white & black players actor UID arguments
        const parsedPlayers = parsedCommand.parseTo([
          { name: 'white', type: Number }, { name: 'black', type: Number }
        ]);

        // Defines current players as minigame is running since now
        this.players = { white: parsedPlayers.parsedData.white, black: parsedPlayers.parsedData.black };
        // Now that players is defined, we notify about new minigame state
        this.started.next(true);

        break;
      case 'STOP':
        this.players = undefined;
        this.started.next(false);

        break;
      case 'ROUND_FOR':
        // Parses arg which is either WHITE or BLACK, and emits the appropriate UID for that next player
        const parsedNextPlayer = parsedCommand.parseTo([{ name: 'actor', type: this.playerToUid }]);
        this.currentPlayer.next(parsedNextPlayer.parsedData.actor.uid);

        break;
      case 'SQUARE_STATE':
        // Parses coordinates and state for square being updated
        const parsedSquareUpdate = parsedCommand.parseTo([
          { name: 'squareLine', type: Number }, { name: 'squareColumn', type: Number }, { name: 'updatedState', type: SquareStateParser }
        ]);

        const update = parsedSquareUpdate.parsedData;
        this.updatedSquares.next({
          square: { lineNumber: update.squareLine, columnNumber: update.squareColumn },
          updatedState: update.updatedState.enumValue
        });

        break;
      case 'MOVED':
        // Parses coordinates describing movement of selected pawn
        const parsedMovement = parsedCommand.parseTo([
          { name: 'fromLine', type: Number }, { name: 'fromColumn', type: Number },
          { name: 'toLine', type: Number }, { name: 'toColumn', type: Number }
        ]);

        const move = parsedMovement.parsedData;
        this.movedPawns.next({
          from: { lineNumber: move.fromLine, columnNumber: move.fromColumn },
          to: { lineNumber: move.toLine, columnNumber: move.toColumn }
        });

        break;
      case 'PAWN_COUNTS':
        // Parses pawns count for each player, white then black
        const parsedPawnCounts = parsedCommand.parseTo([
          { name: 'white', type: Number }, { name: 'black', type: Number }
        ]);

        // Passes new parsed pawn counts
        this.pawnCounts.next({ white: parsedPawnCounts.parsedData.white, black: parsedPawnCounts.parsedData.black });

        break;
      case 'VICTORY_FOR':
        // Parses arg which is either WHITE or BLACK, and emits the appropriate UID for that player who won the minigame
        const parsedWinner = parsedCommand.parseTo([{ name: 'actor', type: this.playerToUid }]);

        this.winner.next(parsedWinner.parsedData.actor.uid);

        break;
      default:
        throw new BadSerCommand(`Unknown Minigame command: ${command}`);
    }
  }

  /**
   * Sends a MOVE command to server to perform a specific movement.
   *
   * @param movement Tries to move pawn at `from` into `to` coordinates
   */
  move(movement: PawnMovement): void {
    const { from, to } = movement;

    this.serviceSubject.next(`MOVE ${from.lineNumber} ${from.columnNumber} ${to.lineNumber} ${to.columnNumber}`);
  }

  /**
   * Sends an END command to server to go for next player round.
   */
  finishRound(): void {
    this.serviceSubject.next('END');
  }

  /**
   * Select a different RpT Minigame to start, notifying observers if any.
   *
   * @param minigame RpT Minigame which will be played at game start
   */
  playOn(minigame: MinigameType): void {
    this.currentMinigame = minigame;
  }

  /**
   * @returns Initial minigame grid for current RpT Minigame
   */
  getInitialGrid(): number[][] {
    const copied = initialGrids[this.currentMinigame];
    const gridCopy: number[][] = [];

    for (const line of copied) { // Performs a deep-copy line by line
      gridCopy.push(line.slice()); // Slices performs a deep-copy of the line contained columns
    }

    return gridCopy; // Returns the deep-copy, avoiding initial grid template modifications
  }

  /**
   * @returns Initial pawn counts for each player inside grid of current RpT Minigame
   */
  getInitialPawnCounts(): PlayersConfiguration {
    return initialPawnCounts[this.currentMinigame];
  }

  /**
   * @returns Actors playing current game
   *
   * @throws BadMinigameState if minigame is not runnning
   */
  getPlayers(): PlayersConfiguration {
    if (this.players === undefined) { // If there is no players, it means that no minigame is running
      throw new BadMinigameState('No minigame currently running');
    }

    return this.players;
  }

  /**
   * @returns Selected RpT Minigame type
   */
  getMinigameType(): MinigameType {
    return this.currentMinigame;
  }

  /**
   * @returns Observable for UID of actor associated with player who won the minigame
   */
  getWinner(): Observable<number> {
    return this.winner;
  }

  /**
   * @returns Observable emitting `true` if a minigame just started and `getPlayers()` became available, `false` if it is no longer
   * available because minigame just stopped
   */
  isRunning(): Observable<boolean> {
    return this.started;
  }

  /**
   * @returns Observable emitting every player movement received or confirmed from server
   */
  getMovedPawns(): Observable<PawnMovement> {
    return this.movedPawns;
  }

  /**
   * @returns Observable emitting each new `SquareState` for each square, each time it is modified
   */
  getSquareUpdates(): Observable<SquareUpdate> {
    return this.updatedSquares;
  }

  /**
   * @returns Observable for UID of actor who must play for the current round.
   */
  getCurrentPlayer(): Observable<number> {
    return this.currentPlayer;
  }

  /**
   * @returns Observable for pawns count of each player.
   */
  getPawnCounts(): Observable<PlayersPawnCounts> {
    return this.pawnCounts;
  }
}
