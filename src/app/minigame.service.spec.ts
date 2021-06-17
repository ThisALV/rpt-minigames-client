import { TestBed } from '@angular/core/testing';
import { BadMinigameState, MinigameService, PawnMovement, PlayersPawnCounts, SquareUpdate } from './minigame.service';
import { expectArrayToBeEqual, MockedMessagingSubject, unexpected } from './testing-helpers';
import { RptlProtocolService } from 'rpt-webapp-client';
import { initialGrids, initialPawnCounts } from './initial-grids';
import { MinigameType, SquareState } from './minigame-enums';


describe('MinigameService', () => {
  let connection: MockedMessagingSubject; // Mocked connection, used by RPTL protocol to read data from
  let rptlProtocol: RptlProtocolService; // It will use a mocked connection to emulates the server behavior

  let service: MinigameService;

  beforeEach(() => {
    connection = new MockedMessagingSubject();
    rptlProtocol = new RptlProtocolService();

    TestBed.configureTestingModule({
      providers: [
        { provide: RptlProtocolService, useValue: rptlProtocol }
      ]
    });

    service = TestBed.inject(MinigameService);

    // Because Minigame is only useful as a registered actor, we will emulates a client registration before each unit test
    rptlProtocol.beginSession(connection); // Connects to server
    rptlProtocol.register(42, 'ThisALV'); // Sends LOGIN command
    connection.receive('REGISTRATION 42 ThisALV 33 Redox'); // Server confirms registration, an other player is already registered

    // Clear messages sent on connection to make further unit testing easier
    while (connection.sentMessagesQueue.length !== 0) {
      connection.sentMessagesQueue.pop();
    }
  });

  it('should be created and listen for commands', () => {
    expect(service).toBeTruthy();

    let run: boolean | undefined;
    // We want to checks if command is handled and if game is no longer running once disconnection occurred
    service.isRunning().subscribe({
      next: (running: boolean) => run = running,
      complete: unexpected,
      error: unexpected
    });

    connection.receive('SERVICE EVENT Minigame START 0 1');
    // A command addressed to Minigame should have been handled, causing a value to be passed into isRunning() subject
    expect(run).toBeDefined();

    connection.complete();
    expect(run).toBeFalse(); // Closing connection causes game to stop, so false should be passed into isRunning()
  });

  describe('finishRound()', () => {
    it('should send an END command to server', () => {
      service.finishRound();

      expectArrayToBeEqual(connection.sentMessagesQueue, 'SERVICE REQUEST 0 Minigame END');
    });
  });

  describe('move()', () => {
    it('should send a MOVE command to server with correct stringified coordinates', () => {
      service.move({ from: { lineNumber: 9, columnNumber: 6 }, to: { lineNumber: 2, columnNumber: 1 } });
      service.move({ from: { lineNumber: 3, columnNumber: 5 }, to: { lineNumber: 5, columnNumber: 6 } });
      service.move({ from: { lineNumber: 1, columnNumber: 4 }, to: { lineNumber: 10, columnNumber: 6 } });

      // Each call should have sent a single MOVE command with stringified coordinates as arguments
      expectArrayToBeEqual(connection.sentMessagesQueue,
        'SERVICE REQUEST 0 Minigame MOVE 9 6 2 1',
        'SERVICE REQUEST 1 Minigame MOVE 3 5 5 6',
        'SERVICE REQUEST 2 Minigame MOVE 1 4 10 6'
      );
    });
  });

  describe('playOn()', () => {
    it('should set a new value returned getMinigameType() and changes getInitialGrid/PawnCounts() return', () => {
      service.playOn(MinigameType.BERMUDES); // Selects Bermudes minigame
      expect(service.getInitialGrid()).toEqual(initialGrids[MinigameType.BERMUDES]); // Checks for retrieved grid to be correct
      expect(service.getInitialPawnCounts()).toEqual(initialPawnCounts[MinigameType.BERMUDES]); // Checks for retrieved pawn counts
      expect(service.getMinigameType()).toEqual(MinigameType.BERMUDES); // Checks for emitted RpT Minigame type to also be correct

      /*
       * Repeats same operation for the 2 other minigames.
       */

      service.playOn(MinigameType.ACORES);
      expect(service.getInitialGrid()).toEqual(initialGrids[MinigameType.ACORES]);
      expect(service.getInitialPawnCounts()).toEqual(initialPawnCounts[MinigameType.ACORES]);
      expect(service.getMinigameType()).toEqual(MinigameType.ACORES);

      service.playOn(MinigameType.CANARIES);
      expect(service.getInitialGrid()).toEqual(initialGrids[MinigameType.CANARIES]);
      expect(service.getInitialPawnCounts()).toEqual(initialPawnCounts[MinigameType.CANARIES]);
      expect(service.getMinigameType()).toEqual(MinigameType.CANARIES);
    });
  });

  describe('getPlayers()', () => {
    it('should throw if no game is currently running', () => {
      expect(() => service.getPlayers()).toThrowError(BadMinigameState);
    });

    /*
     * Normal case is tested through Commands handling unit tests
     */
  });

  describe('getInitialGrid()', () => {
    it('should retrieve a deep-copy of the initial grid', () => {
      const grid = service.getInitialGrid();
      expect(grid).toEqual(initialGrids[MinigameType.ACORES]); // Default configuration minigame type is Açores

      grid[0][0] = SquareState.FREE; // Tries to modify one square inside grid
      expect(grid).not.toEqual(initialGrids[MinigameType.ACORES]); // Modification should have been done on the deep-copy only
    });
  });

  describe('Commands handling', () => {
    it('should define players configuration and pass true to isRunning() on START', () => {
      let run: boolean | undefined;
      service.isRunning().subscribe({
        next: (running) => run = running,
        complete: unexpected,
        error: unexpected
      });

      connection.receive('SERVICE EVENT Minigame START 3 5'); // White player for actor 3 and black player for actor 5

      expect(run).toBeTrue(); // Checks for session to have been ran by this command
      expect(service.getPlayers()).toEqual({ white: 3, black: 5 }); // It should have assigned correct UIDs to each player
    });

    it('should reset players configuration and pass false to isRunning() on STOP', () => {
      let run: boolean | undefined;
      service.isRunning().subscribe({
        next: (running) => run = running,
        complete: unexpected,
        error: unexpected
      });

      connection.receive('SERVICE EVENT Minigame STOP');

      expect(run).toBeFalse(); // Checks for session to no longer being ran
      expect(() => service.getPlayers()).toThrowError(BadMinigameState); // It should have reset assigned UIDs, players aren't available
    });

    describe('ROUND_FOR command', () => {
      const whitePlayerActor = 0;
      const blackPlayerActor = 1;

      let currentPlayerActor: number | undefined; // Last UID emitted by getCurrentPlayer(), if any

      // For each unit test on that command, 2 players must be assigned in the first place
      beforeEach(() => {
        // White player with UID 0, black player with UID 1, for every ROUND_FOR unit test
        connection.receive(`SERVICE EVENT Minigame START ${whitePlayerActor} ${blackPlayerActor}`);

        service.getCurrentPlayer().subscribe({
          next: (uid: number) => currentPlayerActor = uid,
          complete: unexpected,
          error: unexpected
        });
      });

      it('should pass white player actor UID to getCurrentPlayer() on ROUND_FOR WHITE', () => {
        connection.receive('SERVICE EVENT Minigame ROUND_FOR WHITE');

        expect(currentPlayerActor).toEqual(whitePlayerActor); // Checks for next player to be the white one
      });

      it('should pass black player actor UID to getCurrentPlayer() on ROUND_FOR BLACK', () => {
        connection.receive('SERVICE EVENT Minigame ROUND_FOR BLACK');

        expect(currentPlayerActor).toEqual(blackPlayerActor); // Checks for next player to be the black one
      });
    });

    describe('SQUARE_STATE command', () => {
      let latestUpdate: SquareUpdate | undefined; // Each unit test will have to check for emitted value

      beforeEach(() => { // So each unit test will listen for emitted value and saves them for further assertions
        service.getSquareUpdates().subscribe({
          next: (update: SquareUpdate) => latestUpdate = update,
          complete: unexpected,
          error: unexpected
        });
      });

      it('should pass SquareUpdate with SquareState.FREE on FREE argument', () => {
        connection.receive('SERVICE EVENT Minigame SQUARE_STATE 2 5 FREE');
        expect(latestUpdate).toEqual({ square: { lineNumber: 2, columnNumber: 5 }, updatedState: SquareState.FREE });
      });

      it('should pass SquareUpdate with SquareState.WHITE on WHITE argument', () => {
        connection.receive('SERVICE EVENT Minigame SQUARE_STATE 4 3 WHITE');
        expect(latestUpdate).toEqual({ square: { lineNumber: 4, columnNumber: 3 }, updatedState: SquareState.WHITE });
      });

      it('should pass SquareUpdate with SquareState.BLACK on BLACK argument', () => {
        connection.receive('SERVICE EVENT Minigame SQUARE_STATE 1 1 BLACK');
        expect(latestUpdate).toEqual({ square: { lineNumber: 1, columnNumber: 1 }, updatedState: SquareState.BLACK });
      });
    });

    it('should pass PawnMovement into getMovedPawns() on MOVED', () => {
      const emittedMoves: PawnMovement[] = []; // Every moves emitted by getMovedPawns() will be pushed inside that queue
      service.getMovedPawns().subscribe({
        next: (move: PawnMovement) => emittedMoves.push(move),
        complete: unexpected,
        error: unexpected
      });

      // Three moves will be emitted and queued
      connection.receive('SERVICE EVENT Minigame MOVED 5 3 2 2');
      connection.receive('SERVICE EVENT Minigame MOVED 4 4 2 1');
      connection.receive('SERVICE EVENT Minigame MOVED 3 3 1 5');

      // These moves should have been parsed successfully
      expectArrayToBeEqual(emittedMoves,
        { from: { lineNumber: 5, columnNumber: 3 }, to: { lineNumber: 2, columnNumber: 2 } },
        { from: { lineNumber: 4, columnNumber: 4 }, to: { lineNumber: 2, columnNumber: 1 } },
        { from: { lineNumber: 3, columnNumber: 3 }, to: { lineNumber: 1, columnNumber: 5 } },
      );
    });

    it('should pass PlayersPawnCounts to getPawnCounts() on PAWN_COUNTS', () => {
      const emittedCounts: PlayersPawnCounts[] = []; // Every moves emitted by getPawnCounts() will be pushed inside that queue
      service.getPawnCounts().subscribe({
        next: (counts: PlayersPawnCounts) => emittedCounts.push(counts),
        complete: unexpected,
        error: unexpected
      });

      // Three counts will be emitted and queued
      connection.receive('SERVICE EVENT Minigame PAWN_COUNTS 9 5');
      connection.receive('SERVICE EVENT Minigame PAWN_COUNTS 11 12');
      connection.receive('SERVICE EVENT Minigame PAWN_COUNTS 1 0');

      // These counts should have been parsed successfully
      expectArrayToBeEqual(emittedCounts,
        { white: 9, black: 5 },
        { white: 11, black: 12 },
        { white: 1, black: 0 },
      );
    });

    describe('VICTORY_FOR command', () => {
      const whitePlayerActor = 0;
      const blackPlayerActor = 1;

      let latestWinner: number | undefined; // Each unit test will have to check for emitted value

      beforeEach(() => { // So each unit test will listen for emitted value and saves them for further assertions
        // White player with UID 0, black player with UID 1, for every ROUND_FOR unit test
        connection.receive(`SERVICE EVENT Minigame START ${whitePlayerActor} ${blackPlayerActor}`);

        service.getWinner().subscribe({
          next: (winner: number) => latestWinner = winner,
          complete: unexpected,
          error: unexpected
        });
      });

      it('should pass white actor UID to getWinner() on WHITE argument', () => {
        connection.receive('SERVICE EVENT Minigame VICTORY_FOR WHITE');
        expect(latestWinner).toEqual(whitePlayerActor);
      });

      it('should pass white actor UID to getWinner() on BLACK argument', () => {
        connection.receive('SERVICE EVENT Minigame VICTORY_FOR BLACK');
        expect(latestWinner).toEqual(blackPlayerActor);
      });
    });
  });
});
