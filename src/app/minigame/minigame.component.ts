import { AfterViewChecked, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Coordinates, MinigameService, PawnMovement, PlayersPawnCounts, SquareUpdate } from '../minigame.service';
import { PartialObserver, Subscribable, Unsubscribable } from 'rxjs';
import { MinigameType, SquareState } from '../minigame-enums';
import { ActorsNameService } from '../actors-name.service';
import { ResizeObserver } from 'resize-observer';


/**
 * Player owner actor UID associated with its current number of pawns inside game grid and its pawn color.
 */
export type PlayersDetails = { [playerActorUid: number]: { pawns: number, color: SquareState } };


/**
 * Latest value assigned to `style.width` on grid HTML element, provided for testing purpose.
 */
export let latestWidthTrace: string | undefined;


/**
 * `width` attribute of given element is set to its `height`.
 *
 * @param gameGrid element to give a square shape for
 *
 * @note For testing purpose, because callbacks zone must be executed then stopped before expectations which requires to removes grid
 * HTML element, a debug value `latestWidthTrace` keeps track of the width assigned inside the latest call.
 */
function readjustGameGrid(gameGrid: HTMLElement): void {
  gameGrid.style.width = `${gameGrid.clientHeight}px`; // Retrieves px height so assign a px-formatted width
  latestWidthTrace = gameGrid.style.width;
}


/**
 * Listens for changes inside Minigame SER service to provides game statistics, or players details and minigame grid to display if a
 * game is running.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-minigame',
  templateUrl: './minigame.component.html',
  styleUrls: ['./minigame.component.css']
})
export class MinigameComponent implements OnInit, OnDestroy, AfterViewChecked {
  /**
   * Accessible enum values for `MinigameType`.
   */
  minigameTypes = MinigameType;

  /**
   * Accessibe enum values for `SquareState`.
   */
  squareStates = SquareState;

  /**
   * `true` if a game session is currently running with 2 players so minigame should be displayed, `false` otherwise.
   */
  isRunning: boolean;

  /**
   * RpT Minigame currently run by server if any.
   */
  runMinigame?: MinigameType;

  /**
   * Name of actor owning player who won the last game session, if any. Will be displayed if defined and if no game is currently running.
   */
  latestWinner?: string;

  /**
   * Statistics for actors playing this game session. `undefined` if no game is currently running.
   */
  players?: PlayersDetails;

  /**
   * UID for actor owning the player which must play for this round, `undefined` if no game running.
   */
  currentPlayer?: number;

  /**
   * Grid for current game session, `undefined` if no game running, otherwise filled with pawns represented with a `SquareState` value
   * for their owning player, if any.
   */
  gameGrid?: SquareState[][];

  /**
   * Coordinates from the 1st selected pawn which will be moved when a 2nd valid destination square will be selected by player,
   * `undefined` if nothing is currently selected.
   */
  movedPawn?: Coordinates;

  /// Contains every Subscription made on `ngOnInit()` that must be freed inside `ngOnDestroy()`.
  private subscriptions: Unsubscribable[];
  /// Observer that sets grid width to its height so it will be shaped like a square
  private gridObserver: ResizeObserver;
  /// To modify its width, we'll have to access DOM element anyway, it's easier than using callback arg
  private gameGridElement: HTMLElement | null;

  constructor(
    private readonly callbacksZone: NgZone,
    private readonly minigame: MinigameService,
    public readonly namesProvider: ActorsNameService
  ) {
    this.isRunning = false; // Waits for server to notifies us that a game is running
    this.subscriptions = []; // No subscription at ngOnInit() not run yet because we're inside ctor
    this.gameGridElement = null; // Element is selected at component initialization

    // We'll only observe .game-grid resized events, so when observer emits, we known this precise element has been resized
    this.gridObserver = new ResizeObserver(() =>
      this.callbacksZone.run(() => // Runs when view has been updated has been done so width property is actually modified
        readjustGameGrid(this.gameGridElement as HTMLElement)
      )
    );
  }

  /// Subscribes to an Observable and automatically cancels subscription at component destruction
  private safelySubscribe<T>(subscribable: Subscribable<T>, observer: PartialObserver<T>): void {
    this.subscriptions.push(subscribable.subscribe(observer));
  }

  /// Handles isRunning true value to setup game configuration using RpT Minigame type
  private setupGameState(): void {
    this.runMinigame = this.minigame.getMinigameType(); // Configures RpT Minigame type to have appropriate class for HTML element
    this.gameGrid = this.minigame.getInitialGrid(); // Initializes grid for that minigame type

    const playersConfig = this.minigame.getPlayers(); // Retrieves known UIDs for white and black players owner
    const pawnCounts = this.minigame.getInitialPawnCounts(); // Retrieves beginning number of pawns for each player
    // Initializes players registry with known UIDs for white and black players
    this.players = {
      [playersConfig.white]: { pawns: pawnCounts.white, color: SquareState.WHITE },
      [playersConfig.black]: { pawns: pawnCounts.black, color: SquareState.BLACK }
    };
  }

  /// Handles isRunning false value to reset game configuration to undefined
  private resetGameState(): void {
    // Resets board game state, keeps latestWinner as its a statistics field
    this.runMinigame = undefined;
    this.currentPlayer = undefined;
    this.gameGrid = undefined;
    this.movedPawn = undefined;
  }

  /// Handles getSquareUpdates() object to modify game grid
  private updateSquare(update: SquareUpdate): void {
    // Can only be called if a game is running, we're sure it will be defined
    (this.gameGrid as number[][])[update.square.lineNumber - 1][update.square.columnNumber - 1] = update.updatedState;
  }

  /// Handles getMovedPawns() object to modify game grid
  private performMove(move: PawnMovement): void {
    // Can only be called if a game is running, we're sure it will be defined
    const definedGrid = this.gameGrid as number[][];
    // Pawn color for current round player. Can only be called if a game is running so we're sure every required field will be defined.
    const pawnColor = (this.players as PlayersDetails)[this.currentPlayer as number].color;

    definedGrid[move.from.lineNumber - 1][move.from.columnNumber - 1] = SquareState.FREE; // Previous pawn square is now free
    definedGrid[move.to.lineNumber - 1][move.to.columnNumber - 1] = pawnColor; // And now destination square is kept by this pawn
  }

  /// Handles getPawnsCount() object to modify players stats
  private updatePlayers(pawns: PlayersPawnCounts): void {
    // Conversion avoid to cast this.player each time as we're sure it is defined from here
    const definedPlayers = this.players as PlayersDetails;
    // Will be defined inside for-in loop, so give them a value to have the PlayerDetails value type
    let whitePlayer: { pawns: number, color: SquareState } = { pawns: NaN, color: SquareState.FREE };
    let blackPlayer: { pawns: number, color: SquareState } = { pawns: NaN, color: SquareState.FREE };

    // Iterates over every player, affecting its reference to one of the two locals depending on its color
    for (const uid in definedPlayers) {
      if (!definedPlayers.hasOwnProperty(uid)) { // Required check for property to effectively being data about a player
        continue;
      }

      const currentPlayer = definedPlayers[Number(uid)];
      const currentPlayerColor = currentPlayer.color;

      // Checks for player color
      if (currentPlayerColor === SquareState.WHITE) {
        whitePlayer = currentPlayer;
      } else if (currentPlayerColor === SquareState.BLACK) {
        blackPlayer = currentPlayer;
      }
    }

    // For each player of color, assigns the correct number of pawns stored by color inside given argument
    whitePlayer.pawns = pawns.white;
    blackPlayer.pawns = pawns.black;
  }

  /**
   * Handles a browser user which is selecting a square inside the grid, just selecting a pawn if no one is selected yet, moving to
   * selected direction if a previous pawn has already been selected or reset selection if the same square is selected twice.
   *
   * @param square Selected coordinates inside grid
   */
  select(square: Coordinates): void {
    if (this.movedPawn === undefined) { // If no pawn is currently selected, select a pawn to move
      this.movedPawn = square;
    // If a pawn to move as already been select and if the same pawn which is selected now...
    } else if (square.lineNumber === this.movedPawn.lineNumber && square.columnNumber === this.movedPawn.columnNumber) {
      this.movedPawn = undefined; // ...cancels selection
    } else { // If a pawn to move is selected and currently selected square is different, then try to perform the move and resets selection
      this.minigame.move({ from: this.movedPawn, to: square });
      this.movedPawn = undefined;
    }
  }

  /**
   * Tries to stop current turn to go for next player round, if possible.
   */
  pass(): void {
    this.minigame.finishRound();
  }

  /**
   * Retrieves UIDs list for actors owning a player inside this game session.
   */
  getPlayerActors(): number[] {
    // Lists players registry keys to get UIDs as string, then convert these UIDs into number primitive type
    return Object.keys(this.players as PlayersDetails).map((stringifiedUid: string) => Number(stringifiedUid));
  }

  /**
   * Listens for updates on game state and game board.
   */
  ngOnInit(): void {
    this.safelySubscribe(this.minigame.isRunning(), { // Component state matches service state
      next: (running: boolean) => {
        this.isRunning = running;

        if (!running) { // If game stops, we must reset game state.
          this.resetGameState();
        } else { // Else, observers will updates fields when required which are initialized depending on configured RpT Minigame type
          this.setupGameState(); // Only minigame type, grid and players are not passed using subject and have to be set here
        }
      }
    });

    this.safelySubscribe(this.minigame.getWinner(), { // Listens for latest game result to display when game session is terminated
      // Retrieves name immediately as actor might disconnect later
      next: (winnerActorUid: number) => this.latestWinner = this.namesProvider.nameFor(Number(winnerActorUid))
    });

    this.safelySubscribe(this.minigame.getCurrentPlayer(), { // Listens for current round actor which should play
      next: (currentPlayerOwnerUid: number) => this.currentPlayer = Number(currentPlayerOwnerUid)
    });

    this.safelySubscribe(this.minigame.getPawnCounts(), { // Listens for pawns count updates to modify counter for each player
       next: (pawns: PlayersPawnCounts) => this.updatePlayers(pawns)
    });

    /*
     * Listens for updates and pawn movements that occur inside game grid to modify displayed grid according to events received from server.
     */

    this.safelySubscribe(this.minigame.getSquareUpdates(), {
      next: (update: SquareUpdate) => this.updateSquare(update)
    });

    this.safelySubscribe(this.minigame.getMovedPawns(), {
      next: (move: PawnMovement) => this.performMove(move)
    });
  }

  /**
   * Unsubscribes every Observable subscribed inside `ngOnInit()`, resets subscriptions registry and resets game session state.
   */
  ngOnDestroy(): void {
    if (this.gameGridElement !== null) { // If currently observed, must be unobserved before destruction
      this.gridObserver.unobserve(this.gameGridElement as Element); // Must be unobserved before an other HTML grid element is assigned
    }

    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }

    this.subscriptions = [];

    // Might have been disconnected in an unexpected fashion, in this case game board must be reset for the next game session
    this.resetGameState();
  }

  /**
   * Observes .game-grid element size to shape it like a scare if is displayed and it is not already observing. Element will be
   * unobserved if it is currently observing and HTML element no longer exist.
   */
  ngAfterViewChecked(): void {
    const isObserving = this.gameGridElement !== null; // true if component is already checking for grid size to have correct dimensions

    if (this.isRunning && !isObserving) { // If game is running so grid exists
      this.gameGridElement = document.querySelector('.game-grid'); // For this life-cycle, document element will be the same
      this.gridObserver.observe(this.gameGridElement as Element); // Listen for height of flex auto game grid to be changed by flex-box
    } else if (!this.isRunning && isObserving) { // Game grid just been dismisses now
      this.gridObserver.unobserve(this.gameGridElement as Element); // Must be unobserved before an other HTML grid element is assigned
      this.gameGridElement = null; // No HTML component is available and we're no longer observing
    }
  }
}
