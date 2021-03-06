import { TestBed } from '@angular/core/testing';
import { BadLobbyState, LobbyService } from './lobby.service';
import { RptlProtocolService } from 'rpt-webapp-client';
import { expectArrayToBeEqual, expectArrayToContainAllOff, MockedMessagingSubject, unexpected } from './testing-helpers';
import { Player } from './player';


describe('LobbyService', () => {
  let connection: MockedMessagingSubject; // Mocked connection, used by RPTL protocol to read data from
  let rptlProtocol: RptlProtocolService; // It will use a mocked connection to emulates the server behavior

  let service: LobbyService;
  // Last value emitted by getPlayers(), if any. It requires to be defined because getPlayers() is called at beforeEach.
  let players: Player[] | undefined;

  beforeEach(() => {
    connection = new MockedMessagingSubject();
    rptlProtocol = new RptlProtocolService();

    TestBed.configureTestingModule({
      providers: [ // Uses service bounded injected with RPTL protocol using mocked connection
        { provide: RptlProtocolService, useValue: rptlProtocol }
      ]
    });

    service = TestBed.inject(LobbyService);

    // Must be listened before registration, otherwise initial players will not be saved at it is emitted right after registration
    service.getPlayers().subscribe({
      next: (updatedPlayers: Player[]) => players = updatedPlayers,
      complete: unexpected,
      error: unexpected
    });

    // Because Lobby is only useful as a registered actor, we will emulates a client registration before each unit test
    rptlProtocol.beginSession(connection); // Connects to server
    rptlProtocol.register(42, 'ThisALV'); // Sends LOGIN command
    connection.receive('REGISTRATION 42 ThisALV 33 Redox'); // Server confirms registration, an other player is already inside Lobby
  });

  it('should be created, listen for players list and commands, and reset at disconnection', () => {
    expect(service).toBeTruthy();

    let handledCommand = false; // Here we just want to check if command is listened, so we're watching out for its handling
    service.isPlaying().subscribe({
      next: () => handledCommand = true,
      complete: unexpected,
      error: unexpected
    });

    connection.receive('SERVICE EVENT Lobby PLAYING'); // Checks Lobby commands to be listened for
    service.updatePlayersArraySubject(); // Checks players list to be listened for

    expect(handledCommand).toBeTrue();
    expect(players).toBeDefined();
    expect(players).toHaveSize(2);
    // Here we want to checks if players list is listened for, so we check for initial players
    expectArrayToContainAllOff(players as Player[],
      new Player(42, false), new Player(33, false)
    );

    let started: boolean | undefined;
    service.isStarting().subscribe({ // Here we want to check if state is changed when server disconnects with us
      next: (starting) => started = starting,
      complete: unexpected,
      error: unexpected
    });

    let play: boolean | undefined;
    service.isStarting().subscribe({ // Same thing for isPlaying() subject
      next: (playing) => play = playing,
      complete: unexpected,
      error: unexpected
    });

    expect(started).toBeUndefined(); // No disconnection for now
    expect(play).toBeUndefined();
    connection.complete(); // Disconnects with server
    expect(started).toBeFalse(); // Connection is closed, disconnection occurred, Lobby should be reset so it is no longer starting
    expect(play).toBeFalse(); // If a game was running on this Lobby, it is stopped because of server disconnection
  });

  describe('updatePlayersList()', () => {
    it('should remove missing players', () => {
      connection.receive('LOGGED_OUT 33'); // Emulates Redox disconnection

      expect(players).toBeDefined();
      expect(players).toHaveSize(1);
      expectArrayToContainAllOff(players as Player[], new Player(42, false));
    });

    it('should add new players', () => {
      connection.receive('LOGGED_IN 50 Cobalt'); // Emulates Cobalt disconnection

      expect(players).toBeDefined();
      expect(players).toHaveSize(3);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, false),
        new Player(33, false),
        new Player(50, false),
      );
    });

    it('should do both', () => {
      connection.receive('LOGGED_OUT 33'); // Emulates Redox disconnection
      connection.receive('LOGGED_IN 53 Cobalt'); // Emulates Cobalt connection

      expect(players).toBeDefined();
      expect(players).toHaveSize(2);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, false),
        new Player(53, false),
      );
    });
  });

  describe('getCurrentCountdown()', () => {
    it('should throw if minigame is NOT starting', () => {
      expect(() => service.getCurrentCountdown()).toThrowError(BadLobbyState);
    });

    it('should return countdown duration if minigame is starting', () => {
      connection.receive('SERVICE EVENT Lobby BEGIN_COUNTDOWN 2500'); // Emulates a minigame countdown for 2.5s

      expect(service.getCurrentCountdown()).toEqual(2500);
    });
  });

  describe('Commands handling', () => {
    it('should set ready to true and update array on READY_PLAYER', () => {
      connection.receive('SERVICE EVENT Lobby READY_PLAYER 42'); // Emulates that ThisALV is now ready

      expect(players).toBeDefined();
      expect(players).toHaveSize(2);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, true),
        new Player(33, false)
      );
    });

    it('should set ready to false and update array on WAITING_FOR_PLAYER', () => {
      // Emulates that both players are now ready
      connection.receive('SERVICE EVENT Lobby READY_PLAYER 42');
      connection.receive('SERVICE EVENT Lobby READY_PLAYER 33');
      // Emulates Redox is no longer ready
      connection.receive('SERVICE EVENT Lobby WAITING_FOR_PLAYER 42');
      // By setting the two players as ready, we can check if ready correctly applied. If not, ThisALV state check would pass even if
      // WAITING_FOR_PLAYER hadn't changed anything

      expect(players).toBeDefined();
      expect(players).toHaveSize(2);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, false),
        new Player(33, true)
      );
    });

    it('should set current countdown and push true into starting on BEGIN_COUNTDOWN, unset & false on END_COUNTDOWN',
      () =>  {
        let isStarting: boolean | undefined; // Saves the latest minigame state emitted by service, if any
        service.isStarting().subscribe({
          next: (starting: boolean) => isStarting = starting,
          complete: unexpected,
          error: unexpected
        });

        // Emulates that countdown begin for 3.75s
        connection.receive('SERVICE EVENT Lobby BEGIN_COUNTDOWN 3750');
        expect(isStarting).toBeTrue();
        expect(service.getCurrentCountdown()).toEqual(3750);

        // Emulates that countdown is cancelled
        connection.receive('SERVICE EVENT Lobby END_COUNTDOWN');
        expect(isStarting).toBeFalse();
        expect(() => service.getCurrentCountdown()).toThrowError(BadLobbyState); // Countdown no longer exist
    });

    it('should push true into playing on PLAYING and false on WAITING', () => {
      let isPlaying: boolean | undefined; // Saves the latest status emitted by service, if any
      service.isPlaying().subscribe({
        next: (playing: boolean) => isPlaying = playing,
        complete: unexpected,
        error: unexpected
      });

      // Emulates server notifies Lobby is now busy
      connection.receive('SERVICE EVENT Lobby PLAYING');
      expect(isPlaying).toBeTrue();

      // Emulates server notifies Lobby is now waiting for countdown again
      connection.receive('SERVICE EVENT Lobby WAITING');
      expect(isPlaying).toBeFalse();
    });
  });

  describe('toggleReady()', () => {
    it('should send READY command', () => {
      // Clear messages produced by fixture beforeEach()
      while (connection.sentMessagesQueue.length !== 0) {
        connection.sentMessagesQueue.pop();
      }

      // Toggle state 3 times
      for (let i = 0; i < 3; i++) {
        service.toggleReady();
      }

      // Should have sent 3 times the same command
      expectArrayToBeEqual(connection.sentMessagesQueue,
        'SERVICE REQUEST 0 Lobby READY',
        'SERVICE REQUEST 1 Lobby READY',
        'SERVICE REQUEST 2 Lobby READY'
      );
    });
  });
});
