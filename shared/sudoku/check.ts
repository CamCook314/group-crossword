// Checking a sudoku grid against the classic rules. Values are row by row, givens included, '' where empty.
import { units, type Sudoku } from './model';

/** Squares whose digit is repeated in one of their units (row, column, region or diagonal). */
export function clashes(s: Sudoku, values: string[]): Set<number> {
  const found = new Set<number>();
  for (const unit of units(s)) {
    for (const cell of unit) {
      if (values[cell] && unit.some(other => other !== cell && values[other] === values[cell])) found.add(cell);
    }
  }
  return found;
}

/** Is every square filled with one of the puzzle's digits, with no clashes? */
export function followsRules(s: Sudoku, values: string[]): boolean {
  return (
    values.length === s.rows * s.cols && values.every(v => [...s.digits].includes(v)) && clashes(s, values).size === 0
  );
}
