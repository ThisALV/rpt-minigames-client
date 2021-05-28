/**
 * Used to assign an Observable callback that should NOT be called
 */
export function unexpected(): void {
  fail('Unexpected Observable state');
}
