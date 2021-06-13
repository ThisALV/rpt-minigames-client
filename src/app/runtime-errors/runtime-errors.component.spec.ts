import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { RuntimeErrorsComponent } from './runtime-errors.component';
import { RuntimeError, RuntimeErrorsService } from '../runtime-errors.service';
import { expectArrayToBeEqual } from '../testing-helpers';


/// Transforms runtime errors list into their respective UIDs list
function uidsOf(errors: RuntimeError[]): number[] {
  return errors.map((err: RuntimeError) => err.uid);
}


describe('RuntimeErrorsComponent', () => {
  let component: RuntimeErrorsComponent;
  let fixture: ComponentFixture<RuntimeErrorsComponent>;

  let runtimeErrors: RuntimeErrorsService; // We'll need to throw errors for the component to display them

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RuntimeErrorsComponent ]
    }).compileComponents();

    runtimeErrors = TestBed.inject(RuntimeErrorsService);

    fixture = TestBed.createComponent(RuntimeErrorsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and listen for thrown errors to display them during 5s', fakeAsync(() => {
    expect(component).toBeTruthy();

    // Immediately throws 2 runtime errors
    runtimeErrors.throwError('Error 1');
    runtimeErrors.throwError('Error 2');

    // 3s later...
    tick(3000);
    // ...a 3rd runtime error is thrown
    runtimeErrors.throwError('Error 3');

    // No errors automatically hidden for now
    expectArrayToBeEqual(uidsOf(component.displayedErrors), 0, 1, 2);

    // 2s later, the duration of 5s is reach: 1st and 2nd errors are automatically hidden
    tick(2000);
    expectArrayToBeEqual(uidsOf(component.displayedErrors), 2);

    // 3s later, the duration is reach for the 3rd error which is also automatically hidden
    tick(3000);
    expect(component.displayedErrors).toHaveSize(0);
  }));

  describe('hide()', () => {
    // Prepares runtime errors to filter for each unit test case
    beforeEach(() => {
      for (let i = 0; i < 3; i++) { // Throws 3 runtime errors wit h respective UIDs 0, 1 and 2
        runtimeErrors.throwError('Error');
      }
    });

    it('should hide error if it exists', fakeAsync(() => {
      component.hide(1); // Error with UID 1 is no longer displayed
      expectArrayToBeEqual(uidsOf(component.displayedErrors), 0, 2);

      // This call cannot be put inside afterEach()), it must be inside the fakeAsync zone!
      flushMicrotasks(); // Automatic hiding is disabled right now to a void side effects
    }));

    it('should do nothing if error with given UID does not exist', fakeAsync(() => {
      component.hide(42);
      expectArrayToBeEqual(uidsOf(component.displayedErrors), 0, 1, 2);

      flushMicrotasks(); // Automatic hiding is disabled right now to a void side effects
    }));
  });
});
