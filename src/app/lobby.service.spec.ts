import { TestBed } from '@angular/core/testing';
import { BadLobbyState, LobbyService } from './lobby.service';
import { RptlProtocolService, SerProtocolService } from 'rpt-webapp-client';
import { ActorsListService } from './actors-list.service';
import { ActorsNameService } from './actors-name.service';
import { expectArrayToContainAllOff, MockedMessagingSubject, unexpected } from './testing-helpers';
import { Player } from './player';


describe('LobbyService', () => {
  let connection: MockedMessagingSubject; // Mocked connection, used by RPTL protocol to read data from
  let rptlProtocol: RptlProtocolService; // It will use a mocked connection to emulates the server behavior

  // These 3 injectables will receive data from RPTL protocol on the mocked connection so we can control their behavior
  let serProtocol: SerProtocolService;
  let playersListProvider: ActorsListService;
  let namesProvider: ActorsNameService;

  let service: LobbyService;

  beforeEach(() => {
    connection = new MockedMessagingSubject();
    rptlProtocol = new RptlProtocolService();

    serProtocol = new SerProtocolService(rptlProtocol);
    playersListProvider = new ActorsListService(rptlProtocol);
    namesProvider = new ActorsNameService(rptlProtocol);

    // Because Lobby is only useful as a registered actor, we will emulates a client registration before each unit test
    rptlProtocol.beginSession(connection); // Connects to server
    rptlProtocol.register(42, 'ThisALV'); // Sends LOGIN command
    connection.receive('REGISTRATION 42 ThisALV 33 Redox'); // Server confirms registration, an other player is already inside Lobby

    TestBed.configureTestingModule({
      providers: [ // Uses service bounded injected with RPTL protocol using mocked connection
        { provide: SerProtocolService, useValue: serProtocol },
        { provide: ActorsListService, useValue: playersListProvider },
        { provide: ActorsNameService, useValue: namesProvider }
      ]
    });

    service = TestBed.inject(LobbyService);
  });

  // Required to stop RPTL provided subjects at end of each test, it not some subscriber will "leak" outside their tests and cause an
  // error inside afterAll() call.
  afterEach(() => {
    rptlProtocol.endSession(); // Send LOGOUT to engage disconnection
    connection.receive('INTERRUPT'); // Server disconnection done
  });

  it('should be created and listen for players list and commands', () => {
    expect(service).toBeTruthy();

    let handledCommand = false; // Here we just want to check if command is listened, so we're watching out for its handling
    service.isPlaying().subscribe({
      next: () => handledCommand = true,
      complete: unexpected,
      error: unexpected
    });

    let players: Player[] | undefined; // Here we want to checks if players list is listened for, so we check for initial players
    service.getPlayers().subscribe({
      next: (updatedPlayers: Player[]) => players = updatedPlayers,
      complete: unexpected,
      error: unexpected
    });

    connection.receive('SERVICE EVENT Lobby PLAYING'); // Checks Lobby commands to be listened for
    service.updatePlayersArraySubject(); // Checks players list to be listened for

    expect(handledCommand).toBeTrue();
    expect(players).toBeDefined();
    expect(players).toHaveSize(2);
    expectArrayToContainAllOff(players as Player[],
      new Player(42, false), new Player(33, false)
    );
  });

  describe('updatePlayersList()', () => {
    let players: Player[] | undefined;

    // For each unit test, saves which players array is emitted by service
    beforeEach(() => {
      // Here we want to checks if players list is listened for, so we check for initial players
      service.getPlayers().subscribe({
        next: (updatedPlayers: Player[]) => players = updatedPlayers,
        complete: unexpected,
        error: unexpected
      });
    });

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
      connection.receive('LOGGED_IN 53 Cobalt'); // Emulates Cobalt disconnection

      expect(players).toBeDefined();
      expect(players).toHaveSize(3);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, false),
        new Player(5, false),
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
      let players: Player[] | undefined; // Here we want to checks if players list is listened for, so we check for initial players
      service.getPlayers().subscribe({
        next: (updatedPlayers: Player[]) => players = updatedPlayers,
        complete: unexpected,
        error: unexpected
      });

      connection.receive('SERVICE EVENT Lobby READY_PLAYER 42'); // Emulates that ThisALV is now ready

      expect(players).toBeDefined();
      expect(players).toHaveSize(2);
      expectArrayToContainAllOff(players as Player[],
        new Player(42, true),
        new Player(33, false)
      );
    });

    it('should set ready to false and update array on WAITING_FOR_PLAYER', () => {
      let players: Player[] | undefined; // Here we want to checks if players list is listened for, so we check for initial players
      service.getPlayers().subscribe({
        next: (updatedPlayers: Player[]) => players = updatedPlayers,
        complete: unexpected,
        error: unexpected
      });

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
        connection.receive('SEVICE EVENT Lobby END_COUNTDOWN');
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
});
