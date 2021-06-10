import { TestBed } from '@angular/core/testing';
import { CheckoutBusy, CheckoutResponse, ServerStatusService } from './server-status.service';
import { Availability, RptlProtocolService } from 'rpt-webapp-client';
import { expectArrayToBeEqual, mockedDelay, MockedMessagingSubject, unexpected } from './testing-helpers';
import { Subject } from 'rxjs';


describe('ServerStatusService', () => {
  let connection: MockedMessagingSubject; // Mocked connection, used by RPTL protocol to read data from
  let rptlProtocol: RptlProtocolService; // It will use a mocked connection to emulates the server behavior

  let service: ServerStatusService;

  beforeEach(() => {
    connection = new MockedMessagingSubject();
    rptlProtocol = new RptlProtocolService();

    TestBed.configureTestingModule({
      providers: [ // Uses service bounded injected with RPTL protocol using mocked connection
        { provide: RptlProtocolService, useValue: rptlProtocol }
      ]
    });

    service = TestBed.inject(ServerStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkout()', () => {
    let operationResults: CheckoutResponse[]; // Every status emitted by operation will be at the end of each unit test case

    beforeEach(() => {
      operationResults = []; // Clears responses from previous unit test case

      service.getNextResponse().subscribe({ // For each new instance of service, listen for responses to check them later
        next: (result: CheckoutResponse) => operationResults.push(result),
        complete: unexpected,
        error: unexpected
      });
    });

    it('should send a CHECKOUT command and pass object on AVAILABILITY response', () => {
      // next() will NOT be called, doesn't time out for this test case
      service.checkout(connection, mockedDelay(new Subject<undefined>()));

      expectArrayToBeEqual(connection.sentMessagesQueue, 'CHECKOUT'); // Exactly 1 checkout command should have been sent
      connection.receive('AVAILABILITY 1 2'); // We receive a response telling us that 1/2 players are currently inside server
      expectArrayToBeEqual(operationResults, new Availability(1, 2)); // Response should have been handled as expected
    });

    it('should send a CHECKOUT command and pass undefined on connection completed', () => {
      // next() will NOT be called, doesn't time out for this test case
      service.checkout(connection, mockedDelay(new Subject<undefined>()));

      connection.complete(); // Close connection for any reason
      expectArrayToBeEqual(operationResults, undefined); // undefined as we couldn't get status because connection is closed
    });

    it('should send a CHECKOUT command and pass undefined on connection errored', () => {
      // next() will NOT be called, doesn't time out for this test case
      service.checkout(connection, mockedDelay(new Subject<undefined>()));

      connection.error({ message: 'Any reason' }); // Close connection for because an error occurred on stream
      expectArrayToBeEqual(operationResults, undefined); // undefined as we couldn't get status because connection is closed
    });

    it('should pass undefined if connection failed', () => {
      connection.isStopped = true; // If connection is stopped before session began, beginSession() will throw: connection will fail
      // next() will NOT be called, doesn't time out for this test case
      service.checkout(connection, mockedDelay(new Subject<undefined>()));

      expectArrayToBeEqual(operationResults, undefined); // undefined as we couldn't get status because connection has failed
    });

    it('should pass undefined if operation timed out', () => {
      const delayTrigger = new Subject<undefined>(); // next() will be called, because operation times out in this test case
      service.checkout(connection, mockedDelay(delayTrigger));

      delayTrigger.next(); // Times out before response is received
      connection.receive('AVAILABILITY 1 2'); // Receiving response after operation timed out should have no effect
      expectArrayToBeEqual(operationResults, undefined);
    });

    it('should throw if another operation is still running', () => {
      // next() will NOT be called, doesn't time out for this test case
      service.checkout(connection, mockedDelay(new Subject<undefined>()));

      // Tries to run a second concurrent checkout operation, which should fail
      expect(() => service.checkout(connection, mockedDelay(new Subject<undefined>()))).toThrowError(CheckoutBusy);
    });
  });
});
