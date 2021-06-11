import { TestBed } from '@angular/core/testing';
import { LoginService } from './login.service';


describe('LoginService', () => {
  let service: LoginService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoginService);
  });

  it('should be created with an empty name', () => {
    expect(service).toBeTruthy();
    expect(service.name).toEqual('');
  });

  describe('generateUid()', () => {
    it('should always return an unsigned integer on 64bits', () => {
      for (let i = 0; i < 100; i++) {
        const uid = service.generateUid(); // A new random UID to check

        // Checks if it is an integer
        expect(uid).toEqual(Math.floor(uid));
        // Checks if it is fitting inside unsigned 64bits limits
        expect(uid).toBeLessThanOrEqual(2 ** 64 - 1);
        expect(uid).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
