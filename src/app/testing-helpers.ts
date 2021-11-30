import { MonoTypeOperatorFunction, Observable, Subject } from 'rxjs';
import { GameServer } from './game-server';
import { Availability } from 'rpt-webapp-client';


/**
 * Used to assign an Observable callback that should NOT be called
 */
export function unexpected(): void {
  fail('Unexpected Observable state');
}


/**
 * Checks for the 2 given arrays to have the same size and to contain the same elements in the exact same order.
 *
 * @param a1 compared with `a2`
 * @param a2 compared with `a1`
 */
export function expectArrayToBeEqual<T>(a1: T[], ...a2: T[]): void {
  // For 2 arrays to be equal element by element, they must have the same size
  expect(a1).toHaveSize(a2.length);

  // Then checks element by element, as we're sure a1.length === a2.length
  for (let i = 0; i < a2.length; i++) {
    expect(a1[i]).toEqual(a2[i]);
  }
}


/**
 * Checks for the first array to contain at least one time every argument passed, no matter their actual order inside that array.
 *
 * @param arr Array to check content for
 * @param elems Elements to check presence into array for
 */
export function expectArrayToContainAllOff<T>(arr: T[], ...elems: T[]): void {
  // Element by element, checks if it is contained inside array
  for (const e of elems) {
    expect(arr).toContain(e);
  }
}


/**
 * Mocks any subject which is using next() method to send a message and next() callback to receive a message (for example, a
 * `WebSocketSubject<T>`)
 */
export class GenericMockedMessagingSubject<T> extends Subject<T> {
  /**
   * Every `next()` method arguments stored here.
   */
  sentMessagesQueue: T[];

  /**
   * Constructs subject with no sent messages.
   */
  constructor() {
    super();
    this.sentMessagesQueue = [];
  }

  /**
   * Re-open subject after it has been closed by error() or complete(), has no effect if it is already open.
   */
  open(): void {
    this.isStopped = false;
  }

  /**
   * Clear `sendMessagesQueue`, will be empty after this call.
   */
  clear(): void {
    this.sentMessagesQueue = [];
  }

  /**
   * @param message Will be pushed into `sentMessagesQueue`, must *NOT* be `undefined`
   */
  next(message?: T): void {
    this.sentMessagesQueue.push(message as T);
  }

  /**
   * @param message `next()` observers callback will be called using that value
   */
  receive(message: T): void {
    super.next(message);
  }
}


/**
 * Specialization for `GenericMockedMessagingSubject` for textual messages like RPTL protocols.
 */
export class MockedMessagingSubject extends GenericMockedMessagingSubject<string> {}


/**
 * `MockedServersListProvided` initially provides this array with its `getListStatus()` mocked method.
 */
export const DEFAULT_MOCKED_SERVERS: GameServer[] = [
  new GameServer('Açores #1', 'a', new Availability(1, 2)),
  new GameServer('Açores #2', 'a', new Availability(1, 2)),
  new GameServer('Bermudes #1', 'b', new Availability(2, 2)),
  new GameServer('Bermudes #2', 'b'),
  new GameServer('Canaries #1', 'c', new Availability(0, 2)),
  new GameServer('Canaries #2', 'c'),
];


/**
 * Get an operator which blocks values from source until a value is passed to the `trigger` Subject. If a value is emitted by source
 * after trigger, then that value will be immediately passed to returned (or delayed) Observable.
 *
 * @param trigger Subject which is listening for a value to stop blocking values from source Observable
 *
 * @returns An operator blocking while `trigger` isn't passed a value
 */
export function mockedDelay(trigger: Subject<undefined>): MonoTypeOperatorFunction<undefined> {
  // Returns the operators configured to work with given trigger Subject
  return (source: Observable<undefined>): Observable<undefined> => {
    let sourceEmitted = false; // Set when source emits a next value
    let triggered = false; // Set when trigger emits a next value

    const delayed = new Subject<undefined>(); // Will next a value only when triggered and sourceEmitted will be set

    trigger.subscribe({ // Listen for delay end to be triggered by external Subject
      next(): void {
        if (sourceEmitted) { // If a value is waiting to be passed, passes it immediately
          delayed.next();
        } else { // Else, wait a value to be passed, notifying it can be passed immediately since now
          triggered = true;
        }
      }
    });

    source.subscribe({
      next(): void {
        if (triggered) { // If delay has expired, passes value immediately
          delayed.next();
        } else { // Else, wait for delay to expires to pass value
          sourceEmitted = true;
        }
      }
    });

    return delayed;
  };
}
