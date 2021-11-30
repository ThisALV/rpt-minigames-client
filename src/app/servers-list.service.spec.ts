import { TestBed } from '@angular/core/testing';
import { InvalidListeningState, ServersListService } from './servers-list.service';
import { expectArrayToBeEqual, GenericMockedMessagingSubject, unexpected } from './testing-helpers';
import { GameServer } from './game-server';
import { Availability } from 'rpt-webapp-client';
import { RuntimeError, RuntimeErrorsService } from './runtime-errors.service';


describe('ServersListService', () => {
  let service: ServersListService;
  let errorHandlers: RuntimeErrorsService;

  // Mocked connection with hub which retrieves us parsed JSON game servers array
  let mockedHubConnection: GenericMockedMessagingSubject<GameServer[]>;

  beforeEach(() => {
    mockedHubConnection = new GenericMockedMessagingSubject<GameServer[]>(); // Uses a new connection

    service = TestBed.inject(ServersListService);
    // Get RuntimeErrors dependency service to check for reported errors
    errorHandlers = TestBed.inject(RuntimeErrorsService);
  });

  it('should be created with no hub listened', () => {
    expect(service).toBeTruthy(); // Checks for service instantiation
    expect(service.isListening()).toBeFalse(); // Checks for listen operation state
  });

  describe('listen()', () => {
    it('should send REQUEST and wait for parsed JSON data to be received', () => {
      const receivedLists: GameServer[][] = []; // Uses to record every value emitted by servers list subject
      service.getListStatus().subscribe({
        next: (serversList: GameServer[]) => receivedLists.push(serversList),
        error: unexpected, // No WS error expected
        complete: unexpected // No connection closure expected
      });

      service.listen(mockedHubConnection);
      expect(service.isListening()).toBeTrue();

      // We're expecting exactly one empty servers list to have been pushed inside the subject, so the
      // subject will send REQUEST to the hub
      expectArrayToBeEqual(mockedHubConnection.sentMessagesQueue, []);

      // We simulated that hub sends to us, one by one, each of these updated server lists
      const updatedServerLists: GameServer[][] = [
        [
          new GameServer('Açores', 'a', new Availability(0, 2))
        ], [
          new GameServer('Açores', 'a', new Availability(1, 2)),
          new GameServer('Bermudes', 'b')
        ],
        []
      ];

      // Hub send to us the lists
      for (const newList of updatedServerLists) {
        mockedHubConnection.receive(newList);
      }

      // We're expecting them to have been passed through getListStatus() subject
      expectArrayToBeEqual(receivedLists, ...updatedServerLists);
    });

    it('should stop listen and report if an error occurs on stream', () => {
      // Nothing should be passed to the server lists stream if an error occurs on connection
      service.getListStatus().subscribe({
        next: unexpected,
        error: unexpected,
        complete: unexpected
      });

      // We just expect our error handler to catch errors reported from the stream
      errorHandlers.observe().subscribe({
        next(err: RuntimeError): void {
          // We expect this error to keep trace of the error reason
          expect(err.message).toEqual('A random error on connection');
        }
      });

      service.listen(mockedHubConnection);
      mockedHubConnection.error({message: 'A random error on connection' });
      expect(service.isListening()).toBeFalse(); // We should ne longer listen as stream is crashed
    });

    it('should stop listen when connection is closed', () => {
      // Nothing should be passed to the server lists stream if connection is closed
      service.getListStatus().subscribe({
        next: unexpected,
        error: unexpected,
        complete: unexpected
      });

      service.listen(mockedHubConnection);
      mockedHubConnection.complete(); // Triggers observers complete() callback...
      expect(service.isListening()).toBeFalse(); // ...which should stop listen operation
    });

    it('should throw if another listen operation is still running', () => {
      service.listen(mockedHubConnection);
      expect(() => service.listen(mockedHubConnection)).toThrowError(InvalidListeningState);
    });
  });

  describe('stopListening()', () => {
    it('should no longer be listening and no longer react to new lists on stream', () => {
      service.listen(mockedHubConnection); // Starts listen operation
      service.stopListening();

      expect(service.isListening()).toBeFalse(); // Should detect we're no longer on listening state

      // We expect that new values on stream will not be passed through this service as it is no longer listening
      service.getListStatus().subscribe({
        next: unexpected,
        error: unexpected,
        complete: unexpected
      });

      // New list received from hub even if service doesn't listen
      mockedHubConnection.receive([new GameServer('Nothing', 'a')]);
    });

    it('should throw if no listen operation is running', () => {
      expect(() => service.stopListening()).toThrowError(InvalidListeningState);
    });
  });

  describe('requestState()', () => {
    it('should send an empty list into the stream', () => {
      service.listen(mockedHubConnection);
      // Ignores the request sent first by the listen() method
      mockedHubConnection.clear();

      service.requestUpdate();
      // We expect exactly one empty list to have been sent
      expectArrayToBeEqual(mockedHubConnection.sentMessagesQueue, []);
    });

    it('should throw if no listen operation is running', () => {
      expect(() => service.requestUpdate()).toThrowError(InvalidListeningState);
    });
  });
});
