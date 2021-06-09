import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { ServersListComponent } from './servers-list/servers-list.component';


describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ RouterTestingModule ],
      declarations: [ AppComponent, ServersListComponent ],
      providers: [
        {
          // Mocks a web application running on https://localhost/, because GameServerResolutionService requires it to formats URLs
          provide: Window, useValue: {
            location: { protocol: 'https:', hostname: 'localhost' }
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
