import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MinigameComponent } from './minigame.component';
import { RptlProtocolService } from 'rpt-webapp-client';
import { expectArrayToBeEqual, expectArrayToContainAllOff, MockedMessagingSubject } from '../testing-helpers';
import { MinigameType, SquareState } from '../minigame-enums';
import { initialGrids } from '../initial-grids';


describe('MinigameComponent', () => {
  let component: MinigameComponent;
  let fixture: ComponentFixture<MinigameComponent>;

  let connection: MockedMessagingSubject; // Mocked connection to emulates server behavior
  let rptlProtocol: RptlProtocolService; // Used to make connection and registration into game server

  beforeEach(async () => {
    connection = new MockedMessagingSubject(); // Uses a new mocked connection for each test

    await TestBed.configureTestingModule({
      declarations: [ MinigameComponent ]
    }).compileComponents();

    rptlProtocol = TestBed.inject(RptlProtocolService);
    // Must be registered before component initialization stage
    rptlProtocol.beginSession(connection);
    rptlProtocol.register(42, 'ThisALV');
    connection.receive('REGISTRATION 22 Cobalt 42 ThisALV'); // Emulates a server with 2 players to play a minigame

    fixture = TestBed.createComponent(MinigameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Clears on-connection activities related to registration so we check safely check for sent messages later
    while (connection.sentMessagesQueue.length !== 0) {
      connection.sentMessagesQueue.pop();
    }
  });

  it('should create as not running', () => {
    expect(component).toBeTruthy();
    expect(component.isRunning).toBeFalse();
  });

  describe('ngOnInit()', () => {
    it('should match minigame service state, setup fields when started and reset fields when terminated',
      () =>
    {
      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player
      expect(component.isRunning).toBeTrue();
      expect(component.runMinigame).toEqual(MinigameType.ACORES); // Açores is the default minigame for MinigameService configuration
      expect(component.gameGrid).toEqual(initialGrids[MinigameType.ACORES]); // Grid for the right minigame should have been assigned
      expect(component.players).toEqual({ // Should have ThisALV as white, Cobalt as black, with both 12 pawns inside grid
        42: { pawns: 12, color: SquareState.WHITE },
        22: { pawns: 12, color: SquareState.BLACK }
      });

      connection.receive('SERVICE EVENT Minigame STOP'); // Stops minigame
      expect(component.isRunning).toBeFalse();
      // Every game session field should be initialized because game session has been stopped
      expect(component.runMinigame).toBeUndefined();
      expect(component.currentPlayer).toBeUndefined();
      expect(component.gameGrid).toBeUndefined();
      expect(component.movedPawn).toBeUndefined();
    });

    it('should set winner name when winner UID is emitted', () => {
      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player

      expect(component.latestWinner).toBeUndefined(); // For now, nobody won a game session

      connection.receive('SERVICE EVENT Minigame VICTORY_FOR BLACK'); // Cobalt won
      expect(component.latestWinner).toEqual('Cobalt');

      connection.receive('SERVICE EVENT Minigame VICTORY_FOR WHITE'); // ThisALV won
      expect(component.latestWinner).toEqual('ThisALV');
    });

    it('should set current player UID when emitted', () => {
      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player

      connection.receive('SERVICE EVENT Minigame ROUND_FOR BLACK'); // It's Cobalt turn
      expect(component.currentPlayer).toEqual(22);

      connection.receive('SERVICE EVENT Minigame ROUND_FOR WHITE'); // It's ThisALV turn
      expect(component.currentPlayer).toEqual(42);
    });

    it('should modify grid square state on square update and on pawn movements', () => {
      const expectedGrid: SquareState[][] = [];
      for (const line of initialGrids[MinigameType.ACORES]) { // Deeps-copies line by line original grid to change the expected one
        expectedGrid.push(line.slice()); // slice() performs a deep-copy
      }

      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player
      expect(component.gameGrid).toEqual(expectedGrid); // Should begin with Açores initial grid

      connection.receive('SERVICE EVENT Minigame SQUARE_STATE 5 4 FREE');
      expectedGrid[4][3] = SquareState.FREE;
      expect(component.gameGrid).toEqual(expectedGrid);

      connection.receive('SERVICE EVENT Minigame SQUARE_STATE 3 3 WHITE');
      expectedGrid[2][2] = SquareState.WHITE;
      expect(component.gameGrid).toEqual(expectedGrid);

      connection.receive('SERVICE EVENT Minigame ROUND_FOR WHITE'); // Must known that move is performed by the white player
      connection.receive('SERVICE EVENT Minigame MOVED 2 3 3 3'); // White player perform a move from (2, 3) to (3, 3)
      expectedGrid[1][2] = SquareState.FREE;
      expectedGrid[2][2] = SquareState.WHITE;
      expect(component.gameGrid).toEqual(expectedGrid);

      connection.receive('SERVICE EVENT Minigame ROUND_FOR BLACK'); // Switch to black player turn
      connection.receive('SERVICE EVENT Minigame MOVED 4 3 2 3'); // Black player perform a move from (4, 3) to (2, 3)
      expectedGrid[3][2] = SquareState.FREE;
      expectedGrid[1][2] = SquareState.BLACK;
    });

    it('should updates players pawns count when emitted', () => {
      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player

      connection.receive('SERVICE EVENT Minigame PAWN_COUNTS 10 2'); // White player: 10 pawns, Black player: 2 pawns
      expect(component.players).toEqual({
        42: { pawns: 10, color: SquareState.WHITE }, // White player check
        22: { pawns: 2, color: SquareState.BLACK } // Black player check
      });

      connection.receive('SERVICE EVENT Minigame PAWN_COUNTS 8 12'); // White player: 8 pawns, Black player: 12 pawns
      expect(component.players).toEqual({
        42: { pawns: 8, color: SquareState.WHITE }, // White player check
        22: { pawns: 12, color: SquareState.BLACK } // Black player check
      });
    });
  });

  describe('ngOnDestroy()', () => {
    it('should unsubscribes every observer', () => {
      connection.receive('SERVICE EVENT Minigame STOP'); // Ensures every game session field is put to undefined

      fixture.destroy(); // Calls ngOnDestroy()
      // Triggers some Minigame events to emit values and check for observers to have unsubscribed subject successfully
      connection.receive('SERVICE EVENT Minigame ROUND_FOR BLACK');
      connection.receive('SERVICE EVENT Minigame SQUARE_STATE 1 1 FREE');

      // If unsubscribed, every field should remain undefined even if values where emitted
      expect(component.runMinigame).toBeUndefined();
      expect(component.currentPlayer).toBeUndefined();
      expect(component.gameGrid).toBeUndefined();
      expect(component.movedPawn).toBeUndefined();
    });
  });

  describe('select()', () => {
    it('should define movedPawn if it is undefined', () => {
      expect(component.movedPawn).toBeUndefined(); // No movedPawn to at beginning
      component.select({ lineNumber: 1, columnNumber: 2 }); // Should set movedPawn
      expect(component.movedPawn).toEqual({ lineNumber: 1, columnNumber: 2 });
    });

    it('should reset movedPawn if it is defined and equal to arguments coordinates', () => {
      expect(component.movedPawn).toBeUndefined(); // No movedPawn to at beginning
      component.select({ lineNumber: 1, columnNumber: 2 }); // Should set movedPawn once
      component.select({ lineNumber: 1, columnNumber: 2 }); // Should unset movedPawn
      expect(component.movedPawn).toBeUndefined();
      expect(connection.sentMessagesQueue).toHaveSize(0);
    });

    it('should send MOVE and reset movedPawn if it is defined and coordinates are different', () => {
      expect(component.movedPawn).toBeUndefined(); // No movedPawn to at beginning
      component.select({ lineNumber: 1, columnNumber: 2 }); // Should set movedPawn
      component.select({ lineNumber: 2, columnNumber: 1 }); // Should send MOVE command and reset movedPawn

      // Selection should be reset for the next move
      expect(component.movedPawn).toBeUndefined();
      // Checks for move to have been tried
      expectArrayToBeEqual(connection.sentMessagesQueue, 'SERVICE REQUEST 0 Minigame MOVE 1 2 2 1');
    });
  });

  describe('pass()', () => {
    it('should send END command to server', () => {
      component.pass();
      expectArrayToBeEqual(connection.sentMessagesQueue, 'SERVICE REQUEST 0 Minigame END');
    });
  });

  describe('getPlayerActors()', () => {
    it('should retrieves list of UIDs inside game session', () => {
      connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts with ThisALV as white player and Cobalt as black player

      const uids = component.getPlayerActors();
      // Expects only ThisALV and Cobalt, respectively UIDs 42 and 22, to be inside game session
      expect(uids).toHaveSize(2);
      expectArrayToContainAllOff(uids, 42, 22);
    });
  });
});
