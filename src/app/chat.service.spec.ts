import { TestBed } from '@angular/core/testing';
import { ChatService } from './chat.service';
import { expectArrayToBeEqual, MockedMessagingSubject, unexpected } from './testing-helpers';
import { RptlProtocolService } from 'rpt-webapp-client';
import { Message } from './message';


describe('ChatService', () => {
  let connection: MockedMessagingSubject; // Mocked connection, used by RPTL protocol to read data from
  let rptlProtocol: RptlProtocolService; // It will use a mocked connection to emulates the server behavior

  let service: ChatService;

  beforeEach(() => {
    connection = new MockedMessagingSubject();
    rptlProtocol = new RptlProtocolService();

    TestBed.configureTestingModule({
      providers: [
        { provide: RptlProtocolService, useValue: rptlProtocol }
      ]
    });
    service = TestBed.inject(ChatService);

    // Because Minigame is only useful as a registered actor, we will emulates a client registration before each unit test
    rptlProtocol.beginSession(connection); // Connects to server
    rptlProtocol.register(42, 'ThisALV'); // Sends LOGIN command
    connection.receive('REGISTRATION'); // Server confirms registration, chat message authors don't have to really exist

    // Clear messages sent on connection to make further unit testing easier
    while (connection.sentMessagesQueue.length !== 0) {
      connection.sentMessagesQueue.pop();
    }
  });

  it('should be created and listen for received messages', () => {
    expect(service).toBeTruthy();

    const receivedMessages: Message[] = []; // Queue for every message received and parsed from RPTL protocol
    service.getMessages().subscribe({
      next: (message: Message) => receivedMessages.push(message),
      complete: unexpected,
      error: unexpected
    });

    // Emulates reception for 3 different messages, author doesn't have to be real registered actors
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 55 Hello world!');
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 24 ThisALV');
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 3 The third message');

    // Checks that every message has been received by service
    expectArrayToBeEqual(receivedMessages,
      new Message(55, 'Hello world!'),
      new Message(24, 'ThisALV'),
      new Message(3, 'The third message')
    );
  });

  describe('send()', () => {
    it('should send a SR command with message content', () => {
      // Sends 3 messages
      service.send('Hello world');
      service.send('ThisALV');
      service.send('The third message');

      // Checks for the 3 Service Request command to have been sent in the right order
      expectArrayToBeEqual(connection.sentMessagesQueue,
        'SERVICE REQUEST 0 Chat Hello world!',
        'SERVICE REQUEST 1 Chat ThisALV',
        'SERVICE REQUEST 2 Chat The third message'
      );
    });
  });
});
