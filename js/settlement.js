// 精算の計算。金額はすべて整数の円で扱う。

// 1件の支払いを人ごとの負担額に分ける。
// 支払った人以外は1円未満を切り捨て、残りの端数は支払った人が負担する。
export function splitExpense(expense) {
  const shares = {};
  const entries = Object.entries(expense.participants || {})
    .map(([id, weight]) => [id, Math.round(Number(weight) * 100)])
    .filter(([, weight]) => weight > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const amount = Math.round(Number(expense.amount) || 0);
  if (totalWeight === 0) {
    shares[expense.payerId] = amount;
    return shares;
  }
  let assigned = 0;
  for (const [id, weight] of entries) {
    if (id === expense.payerId) continue;
    const share = Math.floor((amount * weight) / totalWeight);
    shares[id] = share;
    assigned += share;
  }
  shares[expense.payerId] = amount - assigned;
  return shares;
}

// 人ごとの「払った額」「負担額」「差額」を集計する。差額がプラスなら受け取る側。
export function computeBalances(expenses, memberIds = []) {
  const result = {};
  const ensure = (id) => (result[id] ??= { paid: 0, owed: 0, balance: 0 });
  memberIds.forEach(ensure);
  for (const expense of expenses) {
    ensure(expense.payerId).paid += Math.round(Number(expense.amount) || 0);
    for (const [id, share] of Object.entries(splitExpense(expense))) {
      ensure(id).owed += share;
    }
  }
  for (const row of Object.values(result)) row.balance = row.paid - row.owed;
  return result;
}

// 差額から「誰が誰にいくら払うか」を作る。払う額が多い人から順に、受け取る額が多い人へ割り当てる。
export function computeTransfers(balances) {
  const byAmountDesc = (a, b) => b.amount - a.amount || a.id.localeCompare(b.id);
  const pick = (sign) => Object.entries(balances)
    .filter(([, row]) => row.balance * sign > 0)
    .map(([id, row]) => ({ id, amount: row.balance * sign }))
    .sort(byAmountDesc);
  const creditors = pick(1);
  const debtors = pick(-1);
  const transfers = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].amount, debtors[d].amount);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    creditors[c].amount -= amount;
    debtors[d].amount -= amount;
    if (creditors[c].amount === 0) c += 1;
    if (debtors[d].amount === 0) d += 1;
  }
  return transfers;
}
