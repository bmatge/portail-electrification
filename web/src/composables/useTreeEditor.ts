// Helpers d'édition d'arbre — manipulation immutable de l'arbre courant
// dans `useTreeStore`. Toutes les opérations recopient le sous-arbre touché
// et appellent `setTree` pour invalider proprement la réactivité Vue.
//
// Les conventions ID/format de nœud collent à `assets/script.js` (legacy v1)
// pour rester rétro-compatible avec les bundles existants.

import type { TreeNode } from '../stores/tree.js';

export function newNodeId(): string {
  return 'n' + Math.random().toString(36).slice(2, 8);
}

export function newBlockId(): string {
  return 'b' + Math.random().toString(36).slice(2, 8);
}

export function newImprovementId(): string {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

export function makeNode(label = 'Nouveau nœud'): TreeNode {
  return {
    id: newNodeId(),
    label,
    types: ['editorial'],
    tldr: '',
    deadline: '',
    audiences: [],
    dispositifs: [],
    mesures: [],
    blocks: [],
    improvements: [],
    children: [],
  };
}

export function* walk(
  node: TreeNode,
  parent: TreeNode | null = null,
  depth = 0,
): Generator<{ node: TreeNode; parent: TreeNode | null; depth: number }> {
  yield { node, parent, depth };
  for (const child of node.children ?? []) yield* walk(child, node, depth + 1);
}

export function find(
  root: TreeNode,
  id: string,
): { node: TreeNode; parent: TreeNode | null } | null {
  for (const { node, parent } of walk(root)) {
    if (node.id === id) return { node, parent };
  }
  return null;
}

export function pathTo(root: TreeNode, id: string): TreeNode[] | null {
  if (root.id === id) return [];
  for (const child of root.children ?? []) {
    const sub = pathTo(child, id);
    if (sub !== null) return [root, ...sub];
  }
  return null;
}

export function ancestorOf(root: TreeNode, targetId: string, candidateId: string): boolean {
  const sub = find(root, candidateId);
  if (!sub) return false;
  for (const { node } of walk(sub.node)) {
    if (node.id === targetId) return true;
  }
  return false;
}

export function audiencesFor(root: TreeNode, node: TreeNode): readonly string[] {
  if (node.audiences && node.audiences.length) return node.audiences;
  const path = pathTo(root, node.id) ?? [];
  for (let i = path.length - 1; i >= 0; i--) {
    const a = path[i]?.audiences;
    if (a && a.length) return a;
  }
  return [];
}

export function primaryType(node: TreeNode): string {
  return (node.types && node.types[0]) || node.type || 'editorial';
}

export function deepClone(node: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(node)) as TreeNode;
}

export type MoveMode = 'before' | 'after' | 'child';

export function performMove(
  root: TreeNode,
  sourceId: string,
  targetId: string,
  mode: MoveMode,
): TreeNode | null {
  if (sourceId === targetId) return null;
  if (ancestorOf(root, targetId, sourceId)) return null;
  if (sourceId === root.id) return null;

  const next = deepClone(root);
  const src = find(next, sourceId);
  const tgt = find(next, targetId);
  if (!src || !tgt) return null;
  if (!src.parent) return null;

  src.parent.children = (src.parent.children ?? []).filter((c) => c.id !== sourceId);

  if (mode === 'child') {
    tgt.node.children = tgt.node.children ?? [];
    tgt.node.children.unshift(src.node);
  } else {
    const tgtParent = tgt.parent;
    if (!tgtParent) {
      next.children = next.children ?? [];
      next.children.unshift(src.node);
    } else {
      const arr = tgtParent.children ?? [];
      const idx = arr.indexOf(tgt.node);
      const insertAt = mode === 'before' ? idx : idx + 1;
      arr.splice(insertAt, 0, src.node);
      tgtParent.children = arr;
    }
  }
  return next;
}

export function moveSibling(root: TreeNode, nodeId: string, delta: -1 | 1): TreeNode | null {
  const next = deepClone(root);
  const found = find(next, nodeId);
  if (!found?.parent) return null;
  const arr = found.parent.children ?? [];
  const idx = arr.indexOf(found.node);
  const target = idx + delta;
  if (target < 0 || target >= arr.length) return null;
  arr.splice(idx, 1);
  arr.splice(target, 0, found.node);
  found.parent.children = arr;
  return next;
}

export function deleteNode(root: TreeNode, nodeId: string): TreeNode | null {
  if (nodeId === root.id) return null;
  const next = deepClone(root);
  const found = find(next, nodeId);
  if (!found?.parent) return null;
  found.parent.children = (found.parent.children ?? []).filter((c) => c.id !== nodeId);
  return next;
}

export function addChild(root: TreeNode, parentId: string, child: TreeNode): TreeNode | null {
  const next = deepClone(root);
  const found = find(next, parentId);
  if (!found) return null;
  found.node.children = found.node.children ?? [];
  found.node.children.push(child);
  return next;
}

export function updateNode(
  root: TreeNode,
  nodeId: string,
  patch: Partial<TreeNode>,
): TreeNode | null {
  const next = deepClone(root);
  const found = find(next, nodeId);
  if (!found) return null;
  Object.assign(found.node, patch);
  return next;
}

export function countNodes(root: TreeNode): { total: number; maxDepth: number } {
  let total = 0;
  let maxDepth = 0;
  for (const { depth } of walk(root)) {
    total++;
    if (depth > maxDepth) maxDepth = depth;
  }
  return { total, maxDepth: maxDepth + 1 };
}
