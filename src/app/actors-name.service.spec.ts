import { TestBed } from '@angular/core/testing';
import { ActorsNameService, UnknownActor } from './actors-name.service';
import { BadRptlMode, RptlProtocolService } from 'rpt-webapp-client';
import { MockedMessagingSubject } from './testing-helpers';


describe('ActorsNameService', () => {
  // Giving access to this injectable, we can mocks server behavior using the following mocked connection
  let rptlProtcol: RptlProtocolService;
  // Mocked connection to checks sent messages and control received messages
  let connection: MockedMessagingSubject;

  let service: ActorsNameService;

  beforeEach(() => {
    rptlProtcol = new RptlProtocolService();
    connection = new MockedMessagingSubject();

    TestBed.configureTestingModule({ // Uses RPTL protocol with required mocked connection
      providers: [
        { provide: RptlProtocolService, useValue: rptlProtcol }
      ]
    });

    service = TestBed.inject(ActorsNameService);
  });

  it('should be created as unavailable because RPTL actor is not registered', () => {
    expect(service).toBeTruthy();
    expect(service.isAvailable()).toBeFalse();
  });

  describe('nameFor()', () => {
    describe('when not registered', () => {
      it('should throw into disconnected state', () => {
        // At construction, RptlProtocolService isn't connected to a server
        expect(() => service.nameFor(0)).toThrowError(BadRptlMode);
      });

      it('should throw into unregistered mode', () => {
        // Connection with server
        rptlProtcol.beginSession(connection);
        // A client must be registered to get details about other actors, not only connected
        expect(() => service.nameFor(0)).toThrowError(BadRptlMode);
      });
    });

    describe('when registered', () => {
      beforeEach(() => { // Emulates a registration into server with already 2 players for each unit test inside that suite
        // Connection with server
        rptlProtcol.beginSession(connection);
        // Registration command, ourself is actor 42 named ThisALV
        rptlProtcol.register(42, 'ThisALV');
        // Server response, registration done successfully, others actors are [33] Redox and [44] Lait2Vache
        connection.receive('REGISTRATION 42 ThisALV 33 Redox 44 Lait2Vache');
      });

      it('should throw if given actor UID is not registered into server', () => {
        // Actor 0 doesn't exist
        expect(() => service.nameFor(0)).toThrowError(UnknownActor);
      });

      it('should update actors DB for each actors list modification', () => {
        // Checks for each actor name to be accessible
        expect(service.nameFor(33)).toEqual('Redox');
        expect(service.nameFor(42)).toEqual('ThisALV');
        expect(service.nameFor(44)).toEqual('Lait2Vache');

        // Emulates a player disconnection
        connection.receive('LOGGED_OUT 33');
        // Redox should no longer exists
        expect(() => service.nameFor(33)).toThrowError(UnknownActor);

        // Emulates a player connection
        connection.receive('LOGGED_IN 5 Cobalt');
        // Cobalt should now exists
        expect(service.nameFor(5)).toEqual('Cobalt');
      });
    });
  });
});
