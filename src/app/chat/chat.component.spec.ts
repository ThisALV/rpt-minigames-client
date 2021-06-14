import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat.component';
import { expectArrayToBeEqual, MockedMessagingSubject } from '../testing-helpers';
import { RptlProtocolService } from 'rpt-webapp-client';
import { FormsModule } from '@angular/forms';


describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;

  let connection: MockedMessagingSubject; // To mock messages reception and check for current message to have been sent

  beforeEach(async () => {
    connection = new MockedMessagingSubject();

    await TestBed.configureTestingModule({
      declarations: [ ChatComponent ],
      imports: [ FormsModule ]
    }).compileComponents();

    const rptlProtocol = TestBed.inject(RptlProtocolService); // Provides access to RPTL service before createComponent() call

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // We have to be registered for the Chat SER Service to work, must be done after detectChanges() call so component is listening for
    // registered mode
    rptlProtocol.beginSession(connection); // Uses mocked connection to receive and send messages
    rptlProtocol.register(42, 'ThisALV'); // Registers to enable SER Protocol features
    connection.receive('REGISTRATION 42 ThisALV 1 Redox 2 Cobalt'); // Server confirms registration with 2 other players connected

    // Clears on-connection activities related to registration so we check safely check for sent messages later
    while (connection.sentMessagesQueue.length !== 0) {
      connection.sentMessagesQueue.pop();
    }
  });

  it('should reset received and written messages, then listen for incoming messages on registered mode', () => {
    expect(component).toBeTruthy();
    expect(component.messages).toHaveSize(0);
    expect(component.currentMessage).toEqual('');

    // Emulates some received messages
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 42 Hello world!');
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 2 ');
    connection.receive('SERVICE EVENT Chat MESSAGE_FROM 1 SSBU');

    // Checks for the 3 messages to have been received
    expect(component.messages[0].author).toEqual('ThisALV');
    expect(component.messages[0].content).toEqual('Hello world!');
    expect(component.messages[1].author).toEqual('Cobalt');
    expect(component.messages[1].content).toEqual('');
    expect(component.messages[2].author).toEqual('Redox');
    expect(component.messages[2].content).toEqual('SSBU');
  });

  describe('sendCurrentMessage()', () => {
    it('should send currentMessage value with service', () => {
      for (const messageToSend of ['Hello world!', '', 'SSBU']) { // Sends 3 messages
        component.currentMessage = messageToSend;
        component.sendCurrentMessage();
      }

      expectArrayToBeEqual( // Checks for the 3 messages to have been sent on the connection
        connection.sentMessagesQueue,
        'SERVICE REQUEST 0 Chat Hello world!',
        'SERVICE REQUEST 1 Chat ',
        'SERVICE REQUEST 2 Chat SSBU',
      );
    });
  });
});
