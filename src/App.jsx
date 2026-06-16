import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, 
  CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, 
  AlertCircle, LogOut, Calendar, Clock, PenTool, Link2, Menu, 
  GripVertical, ZoomIn, ZoomOut, ChevronRight, ExternalLink
} from 'lucide-react';

// --- Firebase のインポート ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

let firebaseConfig = {
  apiKey: "AIzaSyCqTZxvNFGf0O4_DDa7JQ45Zd8hxYKqYHY",
  authDomain: "kanban-cloud-app.firebaseapp.com",
  projectId: "kanban-cloud-app",
  storageBucket: "kanban-cloud-app.firebasestorage.app",
  messagingSenderId: "584318556014",
  appId: "1:584318556014:web:426b5fbfb962b730a7137f"
};

try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase config parsing error", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'kanban-cloud-app';
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = isConfigValid ? initializeApp(firebaseConfig) : null;
const auth = isConfigValid ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = isConfigValid ? getFirestore(app) : null;

const generateId = () => Math.random().toString(36).substr(2, 9);

const compressImage = (dataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
};

const LinkifiedText = ({ text, className, userLinks = [] }) => {
  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const parseLinks = (str) => {
    let parts = [{ type: 'text', content: str }];

    if (userLinks.length > 0) {
      const sortedLinks = [...userLinks].sort((a,b) => b.word.length - a.word.length);
      sortedLinks.forEach(link => {
        if(!link.word) return;
        const regex = new RegExp(`(${escapeRegExp(link.word)})`, 'g');
        const newParts = [];
        parts.forEach(p => {
          if (p.type !== 'text') {
            newParts.push(p);
            return;
          }
          const split = p.content.split(regex);
          split.forEach((s, i) => {
            if (i % 2 === 1) {
              newParts.push({ type: 'userLink', text: s, url: link.url });
            } else if (s !== '') {
              newParts.push({ type: 'text', content: s });
            }
          });
        });
        parts = newParts;
      });
    }

    const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    let newPartsAfterMd = [];
    parts.forEach(p => {
        if(p.type !== 'text') {
            newPartsAfterMd.push(p);
            return;
        }
        let lastIndex = 0;
        let match;
        while ((match = mdRegex.exec(p.content)) !== null) {
            if (match.index > lastIndex) newPartsAfterMd.push({ type: 'text', content: p.content.substring(lastIndex, match.index) });
            newPartsAfterMd.push({ type: 'mdLink', text: match[1], url: match[2] });
            lastIndex = mdRegex.lastIndex;
        }
        if (lastIndex < p.content.length) newPartsAfterMd.push({ type: 'text', content: p.content.substring(lastIndex) });
    });
    parts = newPartsAfterMd;
    
    const finalParts = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    parts.forEach(p => {
      if (p.type !== 'text') {
        finalParts.push(p);
      } else {
        const subParts = p.content.split(urlRegex);
        subParts.forEach(sp => {
          if (urlRegex.test(sp)) finalParts.push({ type: 'rawLink', text: sp, url: sp });
          else if (sp) finalParts.push({ type: 'text', content: sp });
        });
      }
    });

    return finalParts.map((p, i) => {
      if (p.type === 'userLink') {
         return <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[#00CC5B] border-b border-dashed border-[#00CC5B] hover:text-[#00AC4C] font-bold break-words" onClick={(e) => e.stopPropagation()} title={p.url}>{p.text}</a>;
      } else if (p.type === 'mdLink' || p.type === 'rawLink') {
         return <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[#5C80FF] hover:underline font-bold break-words" onClick={(e) => e.stopPropagation()}>{p.text}</a>;
      }
      return <span key={i}>{p.content}</span>;
    });
  };
  return <div className={className}>{parseLinks(text)}</div>;
};

const formatDueDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  const isPast = d < new Date();
  const text = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return { text, isPast };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // レイアウト系
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // カテゴリー・メモ系
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [notes, setNotes] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // リンク集系
  const [links, setLinks] = useState([]);
  const [linkFilter, setLinkFilter] = useState('すべて');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkFormData, setLinkFormData] = useState({ id: '', word: '', url: '', groupName: '一般' });
  const [draggedLinkId, setDraggedLinkId] = useState(null);
  const [dragOverLinkId, setDragOverLinkId] = useState(null);

  // モーダル・エディタ系
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [], dueDate: '', x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [dragOverIndicator, setDragOverIndicator] = useState(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);

  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeBlockInfoRef = useRef({ id: null, cursorPosition: 0 });

  // フリーノート系
  const freenoteRef = useRef(null);
  const [canvasDragState, setCanvasDragState] = useState(null);
  const [freenoteZoom, setFreenoteZoom] = useState(1);

  // リンクのユニークなグループ名を抽出
  const uniqueLinkGroups = Array.from(new Set(links.map(l => l.groupName || '一般'))).sort();

  const saveCursorPosition = (e, blockId) => {
    activeBlockInfoRef.current = { id: blockId, cursorPosition: e.target.selectionStart || 0 };
    setActiveBlockId(blockId);
  };

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(t => {
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
        });
      }, 10);
    }
  }, [isModalOpen, formData.blocks]);

  const ensureVisible = (element) => {
    if (!element) return;
    requestAnimationFrame(() => {
      const container = element.closest('.overflow-y-auto');
      if (!container) return;
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const safeBottom = containerRect.bottom - 180; 
      const safeTop = containerRect.top + 80;
      if (rect.bottom > safeBottom) {
        container.scrollTo({ top: container.scrollTop + (rect.bottom - safeBottom), behavior: 'smooth' });
      } else if (rect.top < safeTop) {
        container.scrollTo({ top: container.scrollTop - (safeTop - rect.top), behavior: 'smooth' });
      }
    });
  };

  const handleTextareaResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    ensureVisible(el);
  };

  useEffect(() => {
    if (activeCategoryId === 'freenote' && freenoteRef.current) {
      // ズームの影響を受けない初期中心位置
      freenoteRef.current.scrollTop = 2500 - freenoteRef.current.clientHeight / 2;
      freenoteRef.current.scrollLeft = 2500 - freenoteRef.current.clientWidth / 2;
    }
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isConfigValid) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') alert(`【ドメイン未登録エラー】\nFirebase Console にて承認済みドメインを追加してください:\n${window.location.hostname}`);
      else alert("ログインに失敗しました。");
      setLoading(false);
    }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (e) {} };

  useEffect(() => {
    if (!user || !isConfigValid) { setCategories([]); setNotes([]); setLinks([]); return; }
    
    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const linksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'links');
    
    let isInitialCategoryLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => (a.order || a.createdAt) - (b.order || b.createdAt));
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: Date.now() });
      } else {
        setCategories(loadedCategories);
        if (!activeCategoryId && isInitialCategoryLoad) setActiveCategoryId(loadedCategories[0]?.id || 'freenote');
      }
      isInitialCategoryLoad = false;
    });

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false);
    });

    const unsubLinks = onSnapshot(linksRef, (snapshot) => {
      const loadedLinks = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setLinks(loadedLinks);
    });

    return () => { unsubCategories(); unsubNotes(); unsubLinks(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);
  const getLinkDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'links', id);

  const handleTabClick = (categoryId) => {
    setActiveCategoryId(categoryId);
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
  };

  const handleAddCategory = async () => {
    if (!user) return;
    const newId = generateId();
    const newCategory = { id: newId, name: '新しいボード', createdAt: Date.now() };
    await setDoc(getCategoryDoc(newId), newCategory);
    handleTabClick(newId);
    setEditingCategoryId(newId);
    setEditingCategoryName(newCategory.name);
  };

  const saveCategoryName = async (id) => {
    if (!user || editingCategoryName.trim() === '') return;
    await setDoc(getCategoryDoc(id), { name: editingCategoryName.trim() }, { merge: true });
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!user || categories.length <= 1) return;
    await deleteDoc(getCategoryDoc(id));
    handleTabClick(categories[0].id);
  };

  const openAddModal = () => {
    setEditingNote(null);
    setFormData({ title: '', categoryId: activeCategoryId === 'freenote' || activeCategoryId === 'deadline' || activeCategoryId === 'linkbook' ? categories[0]?.id : activeCategoryId, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '' });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setEditingNote(note);
    const initialBlocks = note.blocks || [{ id: generateId(), type: 'text', content: note.content || '', checked: false }];
    setFormData({ ...note, blocks: initialBlocks });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const saveNote = async (e) => {
    if (e) e.preventDefault();
    if (!formData.title.trim() || !user) return;
    if (editingNote) {
      await setDoc(getNoteDoc(editingNote.id), formData, { merge: true });
    } else {
      const newId = generateId();
      await setDoc(getNoteDoc(newId), { ...formData, id: newId, isCompleted: false, createdAt: Date.now(), order: Date.now() });
    }
    setIsModalOpen(false);
  };

  const deleteNote = async (id) => {
    if (!user) return;
    await deleteDoc(getNoteDoc(id));
    setIsModalOpen(false);
  };

  const toggleComplete = async (e, id) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === id);
    if (note) {
      setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === noteId);
    if (note) {
      const newBlocks = note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(notes.map(n => n.id === noteId ? { ...n, blocks: newBlocks } : n));
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true });
    }
  };

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id); setDraggedNoteId(id);
    setTimeout(() => { const el = document.getElementById(`note-${id}`); if (el) el.classList.add('opacity-40'); }, 0);
  };
  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null); setDragOverIndicator(null); setDragOverCategoryId(null);
    const el = document.getElementById(`note-${id}`); if (el) el.classList.remove('opacity-40');
  };
  const handleDragOverNote = (e, id) => {
    e.preventDefault();
    if (draggedNoteId === id || activeCategoryId === 'deadline') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverIndicator({ id, position });
  };
  const handleDragLeaveNote = () => setDragOverIndicator(null);
  
  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault();
    const indicator = dragOverIndicator;
    setDragOverIndicator(null);
    if (activeCategoryId === 'deadline') return;
    
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;
    
    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    if (sourceIndex === -1) return;
    
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    const targetIdxAfterRemove = newCategoryNotes.findIndex(n => n.id === targetId);
    if (targetIdxAfterRemove === -1) return;
    
    const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
    newCategoryNotes.splice(insertIndex, 0, removed);
    
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: index * 1000 }));
    setNotes(prev => [...prev.filter(n => n.categoryId !== activeCategoryId), ...updatedNotes]);
    for (const note of updatedNotes) await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
  };
  const handleCategoryDragOver = (e, categoryId) => { 
    e.preventDefault(); 
    if (draggedCategoryId && draggedCategoryId !== categoryId) {
      setDragOverCategoryId(categoryId);
    } else if (categoryId !== activeCategoryId && categoryId !== 'deadline' && categoryId !== 'linkbook') {
      setDragOverCategoryId(categoryId); 
    }
  };
  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault(); 
    setDragOverCategoryId(null);
    if (targetCategoryId === 'deadline' || targetCategoryId === 'linkbook') return;

    const sourceCategoryId = e.dataTransfer.getData('categoryId');
    const sourceNoteId = e.dataTransfer.getData('noteId');

    if (sourceCategoryId && sourceCategoryId !== targetCategoryId && user) {
      const sortedCategories = [...categories];
      const srcIdx = sortedCategories.findIndex(c => c.id === sourceCategoryId);
      const tgtIdx = sortedCategories.findIndex(c => c.id === targetCategoryId);
      if (srcIdx === -1 || tgtIdx === -1) return;

      const [removed] = sortedCategories.splice(srcIdx, 1);
      sortedCategories.splice(tgtIdx, 0, removed);
      
      const updatedCategories = sortedCategories.map((c, index) => ({ ...c, order: index * 1000 }));
      setCategories(updatedCategories);
      for (const c of updatedCategories) {
        await setDoc(getCategoryDoc(c.id), { order: c.order }, { merge: true });
      }
      return;
    }

    if (!sourceNoteId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(notes.map(n => n.id === sourceNoteId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceNoteId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

  const handleCategoryDragStart = (e, id) => {
    e.stopPropagation();
    e.dataTransfer.setData('categoryId', id);
    setDraggedCategoryId(id);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryId(null);
    setDragOverCategoryId(null);
  };

  const handleFreenotePointerDown = (e, note) => {
    if (e.target.closest('.no-drag') || e.button !== 0) return;
    setCanvasDragState({ id: note.id, startX: e.clientX, startY: e.clientY, initialX: note.x || 2500, initialY: note.y || 2500 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleFreenotePointerMove = (e) => {
    if (!canvasDragState) return;
    // ズーム比率を考慮して移動量を計算
    const dx = (e.clientX - canvasDragState.startX) / freenoteZoom;
    const dy = (e.clientY - canvasDragState.startY) / freenoteZoom;
    setNotes(prev => prev.map(n => n.id === canvasDragState.id ? { ...n, x: canvasDragState.initialX + dx, y: canvasDragState.initialY + dy } : n));
  };
  const handleFreenotePointerUp = async (e) => {
    if (!canvasDragState) return;
    const targetNote = notes.find(n => n.id === canvasDragState.id);
    setCanvasDragState(null);
    if (targetNote && user) await setDoc(getNoteDoc(targetNote.id), { x: targetNote.x, y: targetNote.y }, { merge: true });
  };
  
  const handleFreenoteDoubleClick = (e) => {
    if (e.target.closest('.freenote-note')) return; 
    
    const rect = freenoteRef.current.getBoundingClientRect();
    // スクロール量とズーム倍率から正確な配置座標を計算
    const x = (e.clientX - rect.left + freenoteRef.current.scrollLeft) / freenoteZoom;
    const y = (e.clientY - rect.top + freenoteRef.current.scrollTop) / freenoteZoom;
    
    setEditingNote(null);
    // 初期から freenote カテゴリを割り当てるが、編集画面で別カテゴリにも変更可能
    setFormData({ title: '', categoryId: 'freenote', blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x, y });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const centerFreenote = () => {
    if (freenoteRef.current) {
      freenoteRef.current.scrollTo({
        top: (5000 * freenoteZoom - freenoteRef.current.clientHeight) / 2,
        left: (5000 * freenoteZoom - freenoteRef.current.clientWidth) / 2,
        behavior: 'smooth'
      });
    }
  };

  const openLinkModal = (link = null) => {
    if (link) {
      setLinkFormData(link);
    } else {
      setLinkFormData({ id: '', word: '', url: '', groupName: linkFilter !== 'すべて' ? linkFilter : '一般' });
    }
    setIsLinkModalOpen(true);
  };

  const handleSaveLink = async (e) => {
    e.preventDefault();
    if (!linkFormData.word.trim() || !linkFormData.url.trim() || !user) return;
    const isNew = !linkFormData.id;
    const id = isNew ? generateId() : linkFormData.id;
    const groupName = linkFormData.groupName.trim() || '一般';
    
    await setDoc(getLinkDoc(id), { 
      id, 
      word: linkFormData.word.trim(), 
      url: linkFormData.url.trim(), 
      groupName, 
      order: isNew ? Date.now() : (linkFormData.order || Date.now()),
      createdAt: isNew ? Date.now() : linkFormData.createdAt 
    }, { merge: true });
    
    setIsLinkModalOpen(false);
  };

  const handleDeleteLink = async (id) => {
    if (!user) return;
    await deleteDoc(getLinkDoc(id));
  };

  // リンクのドラッグ＆ドロップ並び替え
  const handleLinkDragStart = (e, id) => {
    e.dataTransfer.setData('linkId', id); setDraggedLinkId(id);
  };
  const handleLinkDragOver = (e, id) => {
    e.preventDefault(); if (draggedLinkId !== id) setDragOverLinkId(id);
  };
  const handleLinkDrop = async (e, targetId) => {
    e.preventDefault(); setDragOverLinkId(null);
    const sourceId = e.dataTransfer.getData('linkId');
    if (!sourceId || sourceId === targetId || !user) return;

    const currentLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || '一般') === linkFilter);
    const sortedCurrentLinks = currentLinks.sort((a,b) => a.order - b.order);
    
    const sourceIdx = sortedCurrentLinks.findIndex(l => l.id === sourceId);
    const targetIdx = sortedCurrentLinks.findIndex(l => l.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newLinks = [...sortedCurrentLinks];
    const [removed] = newLinks.splice(sourceIdx, 1);
    newLinks.splice(targetIdx, 0, removed);

    const updatedLinks = newLinks.map((l, i) => ({ ...l, order: i * 1000 }));
    
    setLinks(prev => [...prev.filter(l => !updatedLinks.find(ul => ul.id === l.id)), ...updatedLinks]);
    
    for (const l of updatedLinks) {
      await setDoc(getLinkDoc(l.id), { order: l.order }, { merge: true });
    }
  };

  const insertContentIntoText = (contentData, type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
        const targetBlock = prev.blocks[activeIdx];
        const textBefore = targetBlock.content.substring(0, cursorPosition);
        const textAfter = targetBlock.content.substring(cursorPosition);
        const newContentId = generateId();
        const newTextId = generateId();
        const newBlocks = [...prev.blocks];

        newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
        
        if (type === 'image') {
          newBlocks.splice(activeIdx + 1, 0, { id: newContentId, type: 'image', content: contentData }, { id: newTextId, type: 'text', content: textAfter, checked: false });
        } else if (type === 'text') {
          const combinedContent = textBefore + contentData + textAfter;
          newBlocks[activeIdx] = { ...targetBlock, content: combinedContent };
          activeBlockInfoRef.current = { id: targetId, cursorPosition: cursorPosition + contentData.length };
          return { ...prev, blocks: newBlocks };
        } else if (type === 'list' || type === 'checkbox') {
          newBlocks.splice(activeIdx + 1, 0, { id: newContentId, type, content: '', checked: false }, { id: newTextId, type: 'text', content: textAfter, checked: false });
        }

        setTimeout(() => { const el = document.getElementById(`block-input-${type === 'text' ? targetId : newTextId}`); if(el) { el.focus(); ensureVisible(el); }}, 50);
        activeBlockInfoRef.current = { id: type === 'text' ? targetId : newTextId, cursorPosition: 0 };
        setActiveBlockId(type === 'text' ? targetId : newTextId);
        return { ...prev, blocks: newBlocks };
      } else {
        const newContentId = generateId();
        const newTextId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        
        if (type === 'image' || type === 'list' || type === 'checkbox') {
          const blockType = type === 'image' ? 'image' : type;
          newBlocks.splice(insertIdx, 0, { id: newContentId, type: blockType, content: '', checked: false }, { id: newTextId, type: 'text', content: '', checked: false });
          if(type === 'image') { newBlocks[insertIdx].content = contentData; }
        }
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newTextId}`); if(el){ el.focus(); ensureVisible(el); }}, 50);
        activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
        setActiveBlockId(newTextId);
        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const addBlock = (type) => insertContentIntoText('', type);
  const updateBlock = (blockId, updates) => setFormData(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }));
  const removeBlock = (blockId) => setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== blockId) }));

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      if (formData.blocks.length > 1) {
        removeBlock(formData.blocks[index].id);
        if (index > 0) {
          const prevBlock = formData.blocks[index - 1];
          setTimeout(() => {
            const prevInput = document.getElementById(`block-input-${prevBlock.id}`);
            if (prevInput) { prevInput.focus(); const len = prevInput.value.length; prevInput.setSelectionRange(len, len); ensureVisible(prevInput); }
          }, 10);
          activeBlockInfoRef.current = { id: prevBlock.id, cursorPosition: prevBlock.content.length };
          setActiveBlockId(prevBlock.id);
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newId = generateId();
        const newBlocks = [...formData.blocks];
        newBlocks.splice(index + 1, 0, { id: newId, type: blockType, content: '', checked: false });
        setFormData({ ...formData, blocks: newBlocks });
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if (el) { el.focus(); ensureVisible(el); } }, 10);
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
      } else if (blockType === 'text') {
        setTimeout(() => { handleTextareaResize(e); }, 10);
      }
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result);
      insertContentIntoText(compressedUrl, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    let hasImage = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          hasImage = true;
          const file = items[i].getAsFile();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const compressedUrl = await compressImage(reader.result);
            insertContentIntoText(compressedUrl, 'image');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
    if (hasImage) return;

    const html = e.clipboardData?.getData('text/html');
    if (html && html.includes('<a ')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const pastedLinks = doc.querySelectorAll('a');
      if (pastedLinks.length > 0) {
        e.preventDefault();
        pastedLinks.forEach(a => {
            const md = `[${a.textContent}](${a.href})`;
            a.replaceWith(document.createTextNode(md));
        });
        const plainText = doc.body.textContent || "";
        insertContentIntoText(plainText, 'text');
      }
    }
  };

  // ★ カレンダー（15分単位）の操作関数
  const dueDateStr = formData.dueDate || '';
  const datePart = dueDateStr.split('T')[0] || '';
  const timePart = dueDateStr.split('T')[1] || '';
  const [hourPart, minPart] = timePart.split(':');

  const updateDueDate = (date, hour, min) => {
    if (!date) {
      setFormData(prev => ({ ...prev, dueDate: '' }));
      return;
    }
    const h = hour || '12';
    const m = min || '00';
    setFormData(prev => ({ ...prev, dueDate: `${date}T${h}:${m}` }));
  };

  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-8 rounded-2xl shadow-lg border border-[#D7DCD9] max-w-lg w-full">
          <div className="w-16 h-16 bg-[#F7F9F8] text-[#FFE600] rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
          <h2 className="text-[20px] font-bold mb-4 text-center">Firebaseの設定が完了していません</h2>
        </div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-10 rounded-3xl shadow-xl border border-[#D7DCD9] max-w-md w-full text-center">
          <div className="w-20 h-20 bg-[#E0FFEE] text-[#00CC5B] rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3"><CheckSquare className="w-10 h-10" /></div>
          <h1 className="text-[32px] font-bold mb-2 text-[#333333]">Kanban Notes</h1>
          <button onClick={handleGoogleLogin} className="mt-8 w-full flex items-center justify-center gap-[8px] bg-[#FFFFFF] border-2 border-[#D7DCD9] hover:border-[#00CC5B] hover:bg-[#F7F9F8] text-[#333333] px-6 py-4 rounded-xl font-bold text-[16px] transition-all shadow-sm">
            Googleでログインして始める
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#666666]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00CC5B] mb-4" />
        <p className="font-medium text-[16px]">同期中...</p>
      </div>
    );
  }

  const filteredLinks = linkFilter === 'すべて' ? links : links.filter(l => (l.groupName || '一般') === linkFilter);

  let activeNotes = [];
  if (activeCategoryId === 'deadline') {
    activeNotes = notes.filter(n => n.dueDate && (showCompleted ? true : !n.isCompleted)).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  } else if (activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook') {
    activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));
  }

  return (
    <div className="flex h-screen bg-[#F7F9F8] text-[#333333] font-['Roboto','Noto_Sans_JP',sans-serif] overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Roboto:wght@500;700&display=swap');
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D7DCD9; border-radius: 20px; }
      `}} />

      {/* スマホ用サイドバーオーバーレイ */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-[#333333]/50 z-40 sm:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ★ 1. サイドバー */}
      <div className={`transition-all duration-300 ease-in-out shrink-0 z-50 ${isSidebarOpen ? 'w-64' : 'w-0'}`}>
        <aside className={`fixed inset-y-0 left-0 w-64 bg-[#FFFFFF] border-r border-[#D7DCD9] flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-16 flex items-center justify-between px-6 border-b border-[#D7DCD9] shrink-0">
            <h1 className="text-[20px] font-bold text-[#333333] flex items-center gap-[8px]">
              Kanban Notes
            </h1>
            <button className="sm:hidden p-1 text-[#666666]" onClick={() => setIsSidebarOpen(false)}><X className="w-5 h-5"/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-3 flex flex-col gap-1">
            <div onClick={() => handleTabClick('freenote')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'freenote' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
              <PenTool className="w-5 h-5" />
              <span className="font-bold text-[14px]">フリーノート</span>
            </div>
          
          <div onClick={() => handleTabClick('deadline')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'deadline' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
            <Calendar className="w-5 h-5" />
            <span className="font-bold text-[14px]">期限付き</span>
          </div>

          <div onClick={() => handleTabClick('linkbook')} className={`flex items-center gap-[12px] px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${activeCategoryId === 'linkbook' ? 'bg-[#E0FFEE] text-[#00CC5B]' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}`}>
            <Link2 className="w-5 h-5" />
            <span className="font-bold text-[14px]">リンク集</span>
          </div>

          <div className="my-2 border-t border-[#D7DCD9] mx-2" />
          
          <div className="px-3 pb-1 pt-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#C4C4C4]">ボード</span>
            <button onClick={handleAddCategory} className="text-[#666666] hover:text-[#00CC5B] transition-colors"><Plus className="w-4 h-4"/></button>
          </div>

          {categories.map(category => (
            <div
              key={category.id}
              draggable
              onDragStart={(e) => handleCategoryDragStart(e, category.id)}
              onDragEnd={handleCategoryDragEnd}
              onClick={() => handleTabClick(category.id)}
              onDragOver={(e) => handleCategoryDragOver(e, category.id)}
              onDragLeave={() => setDragOverCategoryId(null)}
              onDrop={(e) => handleCategoryDrop(e, category.id)}
              className={`flex items-center gap-[8px] px-3 py-2 rounded-xl transition-colors cursor-pointer group
                ${activeCategoryId === category.id ? 'bg-[#E0FFEE] text-[#00CC5B]' : dragOverCategoryId === category.id ? 'bg-[#E0FFEE] text-[#00AC4C] border border-[#00CC5B] scale-105' : 'text-[#666666] hover:bg-[#F7F9F8] hover:text-[#333333]'}
              `}
            >
              {editingCategoryId === category.id ? (
                <input type="text" value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={() => saveCategoryName(category.id)} onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)} autoFocus className="border border-[#00CC5B] rounded px-2 py-0.5 text-[14px] outline-none bg-[#FFFFFF] w-full" />
              ) : (
                <>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${activeCategoryId === category.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                  <span className="font-bold text-[14px] select-none flex-1 truncate">{category.name}</span>
                  {activeCategoryId === category.id && (
                    <div className="flex items-center shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-[#00CC5B] hover:bg-[#FFFFFF] transition-colors rounded"><Edit2 className="w-3 h-3" /></button>
                      {categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-[#00CC5B] hover:text-[#ED1C24] hover:bg-[#FFFFFF] transition-colors rounded"><X className="w-3 h-3" /></button>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-[#D7DCD9] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-[8px] text-[14px] text-[#666666] font-medium truncate">
            {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-[#D7DCD9]" /> : <div className="w-6 h-6 rounded-full bg-[#D7DCD9]" />}
            <span className="truncate">{user?.displayName || 'ユーザー'}</span>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-[#666666] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded-lg transition-colors"><LogOut className="w-4 h-4" /></button>
        </div>
        </aside>
      </div>

      {/* ★ 右側メインコンテンツ */}
      <div className="flex-1 flex flex-col min-w-0">
        
        <header className="h-16 bg-[#FFFFFF] border-b border-[#D7DCD9] flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button className="p-2 -ml-2 text-[#666666] hover:bg-[#F7F9F8] rounded-lg transition-colors" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-[18px] sm:text-[20px] font-bold text-[#333333] truncate">
              {activeCategoryId === 'freenote' ? 'フリーノート' : activeCategoryId === 'deadline' ? '期限付きメモ' : activeCategoryId === 'linkbook' ? 'リンク集' : categories.find(c => c.id === activeCategoryId)?.name}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && (
              <label className="flex items-center gap-[4px] cursor-pointer text-[12px] sm:text-[14px] text-[#666666] hover:text-[#333333] transition-colors select-none">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-[#00CC5B] focus:ring-[#00CC5B]" />
                <span className="font-medium">完了を表示</span>
              </label>
            )}
            {activeCategoryId !== 'freenote' && activeCategoryId !== 'linkbook' && (
              <button onClick={() => openAddModal()} className="flex items-center justify-center bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] w-10 h-10 rounded-xl transition-all shadow-sm hover:shadow-md" title="新規メモ">
                <Plus className="w-6 h-6" />
              </button>
            )}
            {activeCategoryId === 'linkbook' && (
              <button onClick={() => openLinkModal()} className="flex items-center gap-2 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md font-bold text-[14px]" title="リンクを追加">
                <Plus className="w-4 h-4" /> リンク追加
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative bg-[#F7F9F8] custom-scrollbar">
          
          {activeCategoryId === 'freenote' ? (
            /* ★ 3. フリーノート（ズーム機能付き） */
            <div className="w-full h-full overflow-auto custom-scrollbar relative" ref={freenoteRef} onDoubleClick={handleFreenoteDoubleClick}>
              <div style={{ width: 5000 * freenoteZoom, height: 5000 * freenoteZoom, position: 'relative' }}>
                <div style={{ 
                  transform: `scale(${freenoteZoom})`, transformOrigin: '0 0', width: 5000, height: 5000,
                  backgroundImage: 'radial-gradient(#D7DCD9 2px, transparent 2px)', backgroundSize: '30px 30px'
                }} className="absolute top-0 left-0 pointer-events-none">
                  
                  <div className="pointer-events-auto w-full h-full relative">
                    {notes.filter(n => n.categoryId === 'freenote').map(note => (
                      <div key={note.id} style={{ position: 'absolute', left: note.x || 2500, top: note.y || 2500, width: 320 }} onPointerDown={(e) => handleFreenotePointerDown(e, note)} onPointerMove={handleFreenotePointerMove} onPointerUp={handleFreenotePointerUp} onPointerCancel={handleFreenotePointerUp} className="bg-[#FFFFFF] rounded-xl border border-[#D7DCD9] shadow-md touch-none cursor-grab active:cursor-grabbing hover:border-[#00CC5B] transition-colors z-0 hover:z-10">
                        <div className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-[#333333] text-[16px] truncate pr-2 leading-[1.6]">{note.title || '無題'}</h3>
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(note); }} className="no-drag p-1 text-[#666666] hover:text-[#00CC5B] bg-[#F7F9F8] rounded-md shrink-0"><Edit2 className="w-4 h-4"/></button>
                          </div>
                          <div className="max-h-32 overflow-hidden relative no-drag text-[14px]">
                            {note.blocks?.slice(0, 3).map(block => (
                              <div key={block.id} className="py-0.5">
                                {block.type === 'text' && <div className="text-[#666666] line-clamp-2 leading-[1.6]">{block.content}</div>}
                                {block.type === 'list' && <div className="text-[#666666] flex gap-1 leading-[1.6]"><span className="text-[#666666] font-bold">•</span><span className="line-clamp-1">{block.content}</span></div>}
                                {block.type === 'image' && <div className="text-[#666666] flex items-center gap-1 leading-[1.6]"><ImageIcon className="w-3 h-3"/>画像</div>}
                              </div>
                            ))}
                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFFFFF] to-transparent pointer-events-none"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ズームコントローラー */}
              <div className="fixed bottom-6 right-6 flex items-center bg-[#FFFFFF] shadow-lg rounded-xl border border-[#D7DCD9] overflow-hidden z-20">
                <button onClick={() => setFreenoteZoom(z => Math.max(0.1, z - 0.1))} className="p-3 text-[#666666] hover:bg-[#F7F9F8] transition-colors"><ZoomOut className="w-5 h-5"/></button>
                <div className="relative flex items-center px-1">
                  <select 
                    value={Math.round(freenoteZoom * 10)} 
                    onChange={(e) => setFreenoteZoom(Number(e.target.value) / 10)}
                    className="appearance-none outline-none bg-transparent font-bold text-[#333333] text-[14px] text-center w-12 cursor-pointer hover:bg-[#F7F9F8] py-1 rounded"
                  >
                    {Array.from({length: 20}, (_, i) => i + 1).map(v => (
                      <option key={v} value={v}>{v * 10}%</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setFreenoteZoom(z => Math.min(2, z + 0.1))} className="p-3 text-[#666666] hover:bg-[#F7F9F8] transition-colors"><ZoomIn className="w-5 h-5"/></button>
              </div>
            </div>

          ) : activeCategoryId === 'linkbook' ? (
            /* ★ 2. リンク集画面 */
            <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-4 mb-4 border-b border-[#D7DCD9]">
                <button onClick={() => setLinkFilter('すべて')} className={`px-4 py-2 rounded-full font-bold text-[14px] whitespace-nowrap transition-colors ${linkFilter === 'すべて' ? 'bg-[#00CC5B] text-[#FFFFFF]' : 'bg-[#E0FFEE] text-[#00AC4C] hover:bg-[#00CC5B]/20'}`}>すべて</button>
                {uniqueLinkGroups.map(group => (
                  <button key={group} onClick={() => setLinkFilter(group)} className={`px-4 py-2 rounded-full font-bold text-[14px] whitespace-nowrap transition-colors ${linkFilter === group ? 'bg-[#00CC5B] text-[#FFFFFF]' : 'bg-[#E0FFEE] text-[#00AC4C] hover:bg-[#00CC5B]/20'}`}>{group}</button>
                ))}
              </div>

              <div className="bg-[#FFFFFF] rounded-2xl shadow-sm border border-[#D7DCD9] overflow-hidden p-2">
                <div className="flex flex-col gap-1">
                  {filteredLinks.length === 0 && <div className="p-8 text-center text-[#666666] font-medium">表示するリンクがありません。</div>}
                  {filteredLinks.map(link => (
                    <div 
                      key={link.id} 
                      draggable 
                      onDragStart={(e) => handleLinkDragStart(e, link.id)}
                      onDragOver={(e) => handleLinkDragOver(e, link.id)}
                      onDrop={(e) => handleLinkDrop(e, link.id)}
                      className={`px-3 py-2 flex items-center justify-between gap-4 transition-colors cursor-grab active:cursor-grabbing rounded-lg ${dragOverLinkId === link.id ? 'bg-[#E0FFEE] border border-[#00CC5B]' : 'hover:bg-[#F7F9F8]'}`}
                    >
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <GripVertical className="w-4 h-4 text-[#C4C4C4] shrink-0" />
                        <div className="flex items-center gap-2 flex-1 overflow-hidden">
                          <div className="font-bold text-[#333333] text-[14px] truncate">{link.word}</div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFFFFF] text-[#666666] font-bold border border-[#D7DCD9] shrink-0">{link.groupName || '一般'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-[#5C80FF] hover:bg-[#E0FFEE] rounded-lg transition-colors flex items-center gap-1.5 text-[12px] font-bold"><ExternalLink className="w-4 h-4"/> 開く</a>
                        <div className="w-px h-4 bg-[#D7DCD9] mx-1"></div>
                        <button onClick={() => openLinkModal(link)} className="p-1.5 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>
                        <button onClick={() => handleDeleteLink(link.id)} className="p-1.5 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#FFE0E0] rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* 通常ボード または 期限付き */
            <div className="max-w-7xl mx-auto h-full p-4 sm:p-6">
              {activeNotes.length === 0 ? (
                <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-[#D7DCD9] rounded-2xl text-[#666666] hover:border-[#00CC5B] hover:text-[#00AC4C] transition-colors cursor-pointer max-w-lg mx-auto mt-10 bg-[#FFFFFF]">
                  <div className="text-[18px] font-bold mb-2">メモがありません</div>
                  <div className="text-[14px] font-medium">＋ ここをクリックして新しいメモを追加</div>
                </div>
              ) : (
                <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
                  {activeNotes.map((note) => {
                    const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                    const dueDateInfo = formatDueDate(note.dueDate);
                    return (
                      <div
                        id={`note-${note.id}`}
                        key={note.id}
                        draggable={activeCategoryId !== 'deadline'}
                        onDragStart={(e) => handleDragStart(e, note.id)}
                        onDragEnd={(e) => handleDragEnd(e, note.id)}
                        onDragOver={(e) => handleDragOverNote(e, note.id)}
                        onDragLeave={handleDragLeaveNote}
                        onDrop={(e) => handleDropOnNote(e, note.id)}
                        onClick={() => openEditModal(note)}
                        className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 sm:p-4 transition-all cursor-pointer relative bg-[#FFFFFF] border
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'top' ? 'border-t-[4px] border-t-[#00CC5B] border-b-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'bottom' ? 'border-b-[4px] border-b-[#00CC5B] border-t-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                          ${!dragOverIndicator || dragOverIndicator.id !== note.id ? 'border-[#D7DCD9] hover:border-[#00CC5B] hover:shadow-lg' : ''}
                          ${note.isCompleted ? 'opacity-60 bg-[#F7F9F8]' : ''}
                        `}
                      >
                        {dueDateInfo && !note.isCompleted && (
                          <div className={`text-[12px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit mb-2 ${dueDateInfo.isPast ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                            <Clock className="w-3 h-3" /> {dueDateInfo.text}
                          </div>
                        )}
                        {firstImageBlock && (
                          <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden h-24 sm:h-32 bg-[#F7F9F8] border border-[#D7DCD9] flex items-center justify-center opacity-90">
                            <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                          <h3 className={`font-bold leading-[1.6] line-clamp-2 pr-5 sm:pr-6 text-[16px] sm:text-[18px] ${note.isCompleted ? 'text-[#666666] line-through' : 'text-[#333333]'}`}>{note.title}</h3>
                          <button onClick={(e) => toggleComplete(e, note.id)} className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-[#00CC5B] bg-[#E0FFEE] border-[#00CC5B]' : 'text-[#C4C4C4] bg-[#FFFFFF] border-[#D7DCD9] hover:text-[#00CC5B]'}`}>
                            {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5" />}
                          </button>
                        </div>
                        <div className="relative overflow-hidden max-h-96 rounded-b-lg">
                          <div className="space-y-0 pb-6">
                            {note.blocks?.map(block => (
                              <div key={block.id} className="py-0">
                                {block.type === 'text' && <LinkifiedText text={block.content} userLinks={links} className={`whitespace-pre-wrap font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`} />}
                                {block.type === 'list' && (
                                  <div className={`flex items-start gap-[4px] font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`}>
                                    <span className="text-[#666666] font-bold mt-[2px] shrink-0">•</span><span>{block.content}</span>
                                  </div>
                                )}
                                {block.type === 'checkbox' && (
                                  <div className="flex items-start gap-[4px] cursor-pointer group/check font-medium leading-[1.6] text-[14px] sm:text-[16px]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                    {block.checked ? <CheckSquare className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Square className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                    <span className={`${block.checked || note.isCompleted ? 'line-through text-[#666666]' : 'text-[#333333]'} leading-[1.6]`}>{block.content}</span>
                                  </div>
                                )}
                                {block.type === 'image' && !firstImageBlock && <div className="text-[10px] sm:text-[12px] text-[#666666] flex items-center gap-[4px] my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                              </div>
                            ))}
                          </div>
                          <div className={`absolute bottom-0 left-0 right-0 h-10 sm:h-12 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-[#F7F9F8] to-transparent' : 'bg-gradient-to-t from-[#FFFFFF] to-transparent'}`}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ノート追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-[#FFFFFF] sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#D7DCD9] bg-[#F7F9F8] sm:rounded-t-2xl shrink-0 flex flex-col gap-3 z-10 relative">
              <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
                <div className="flex-1 flex flex-wrap items-center gap-[8px] w-full">
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 min-w-[200px] px-1 py-1 text-[20px] sm:text-[24px] font-bold text-[#333333] bg-transparent border-b-[2px] border-transparent hover:border-[#D7DCD9] focus:border-[#00CC5B] outline-none transition-colors placeholder:text-[#666666]" placeholder="タイトル" />
                  
                  {/* ④ 15分刻みカレンダー */}
                  <div className="flex items-center bg-[#FFFFFF] border border-[#D7DCD9] rounded-lg px-2 py-1 focus-within:border-[#00CC5B] transition-colors shrink-0 gap-1 h-[34px]">
                    <Calendar className="w-4 h-4 text-[#666666] mr-1 hidden sm:block" />
                    <input type="date" value={datePart} onChange={(e) => updateDueDate(e.target.value, hourPart, minPart)} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium cursor-pointer" />
                    {datePart && (
                      <>
                        <select value={hourPart || '12'} onChange={(e) => updateDueDate(datePart, e.target.value, minPart || '00')} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none cursor-pointer">
                          {Array.from({length: 24}).map((_, i) => <option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}時</option>)}
                        </select>
                        <span className="text-[#666666] font-bold">:</span>
                        <select value={minPart || '00'} onChange={(e) => updateDueDate(datePart, hourPart || '12', e.target.value)} className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none cursor-pointer">
                          <option value="00">00分</option>
                          <option value="15">15分</option>
                          <option value="30">30分</option>
                          <option value="45">45分</option>
                        </select>
                        <button type="button" onClick={() => updateDueDate('', '', '')} className="ml-1 p-0.5 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded"><X className="w-3 h-3"/></button>
                      </>
                    )}
                  </div>

                  {/* ★ 振り分け機能：フリーノートのメモもカテゴリー選択可能に */}
                  <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-24 sm:w-32 px-2 sm:px-3 py-1.5 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] bg-[#FFFFFF] text-[12px] sm:text-[14px] text-[#333333] shrink-0 font-medium h-[34px]">
                    <option value="freenote">フリーノート</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto -mt-10 sm:mt-0">
                  {editingNote && <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-[#666666] hover:text-[#ED1C24] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-[4px] sm:gap-[8px]">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('text')} title="テキストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><AlignLeft className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('list')} title="リストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><List className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('checkbox')} title="チェックボックスを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><CheckSquare className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} title="画像を追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><ImageIcon className="w-5 h-5" /></button>
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                </div>
                <div className="flex items-center gap-[8px]">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 sm:px-4 sm:py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#E0FFEE] hover:text-[#00AC4C] hover:border-[#00CC5B] rounded-lg font-bold transition-colors text-[12px] sm:text-[14px]">キャンセル</button>
                  <button type="button" onClick={saveNote} className="px-3 py-1.5 sm:px-5 sm:py-2 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] rounded-lg font-bold transition-colors flex items-center gap-[4px] text-[12px] sm:text-[14px]"><Check className="w-4 h-4" /> 保存</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative bg-[#FFFFFF] sm:rounded-b-2xl">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {formData.blocks?.map((block, index) => (
                    <div key={block.id} className="flex items-start group relative">
                      <div className={`flex justify-center shrink-0 ${block.type === 'text' ? 'w-1 sm:w-0' : 'w-6 sm:w-7 pt-[6px]'}`}> 
                        {block.type === 'list' && <div className="text-[#666666] font-bold text-[18px]">•</div>}
                        {block.type === 'checkbox' && (
                          <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                            {block.checked ? <CheckSquare className="w-5 h-5 text-[#00CC5B]" /> : <Square className="w-5 h-5 text-[#C4C4C4] hover:text-[#00CC5B]" />}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 pl-1 pr-6 sm:pr-8">
                        {block.type === 'image' ? (
                          <div className="relative inline-block my-2 w-full">
                            <img src={block.content} alt="添付画像" className="max-w-full max-h-[400px] object-contain rounded-lg border border-[#D7DCD9]" />
                          </div>
                        ) : (
                          <textarea
                            id={`block-input-${block.id}`}
                            value={block.content}
                            onChange={(e) => { handleTextareaResize(e); updateBlock(block.id, { content: e.target.value }); saveCursorPosition(e, block.id); }}
                            onKeyDown={(e) => { handleKeyDown(e, index, block.type); saveCursorPosition(e, block.id); }}
                            onKeyUp={(e) => saveCursorPosition(e, block.id)}
                            onClick={(e) => saveCursorPosition(e, block.id)}
                            onFocus={(e) => saveCursorPosition(e, block.id)}
                            onPaste={handlePaste}
                            className={`w-full bg-transparent resize-none outline-none py-0.5 m-0 font-medium leading-[1.6] overflow-hidden min-h-[28px]
                              ${block.type === 'checkbox' && block.checked ? 'text-[#666666] line-through' : 'text-[#333333]'} text-[14px] sm:text-[16px]`}
                            rows={1}
                            placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                          />
                        )}
                      </div>
                      
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeBlock(block.id)} className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded transition-all" title="この行を削除">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ★ リンク集の追加・編集モーダル */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-[#FFFFFF] p-6 rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[20px] font-bold text-[#333333] flex items-center gap-2"><Link2 className="text-[#00CC5B]" /> リンクの{linkFormData.id ? '編集' : '追加'}</h2>
              <button onClick={() => setIsLinkModalOpen(false)} className="text-[#666666] hover:bg-[#F7F9F8] p-1.5 rounded-lg"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSaveLink} className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">対象のワード</label>
                <input type="text" value={linkFormData.word} onChange={(e) => setLinkFormData({...linkFormData, word: e.target.value})} placeholder="例: 開発サーバー" required autoFocus className="w-full px-4 py-2 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] text-[#333333] font-medium" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">URL</label>
                <input type="url" value={linkFormData.url} onChange={(e) => setLinkFormData({...linkFormData, url: e.target.value})} placeholder="https://..." required className="w-full px-4 py-2 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] text-[#333333] font-medium" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-[#666666] mb-1">カテゴリー (任意)</label>
                <input type="text" list="link-groups" value={linkFormData.groupName} onChange={(e) => setLinkFormData({...linkFormData, groupName: e.target.value})} placeholder="新しいカテゴリー名、または選択" className="w-full px-4 py-2 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] text-[#333333] font-medium" />
                <datalist id="link-groups">
                  {uniqueLinkGroups.map(g => <option key={g} value={g} />)}
                </datalist>
                <p className="text-[10px] text-[#C4C4C4] mt-1">※看板のボードとは関係なく、リンク専用のカテゴリーを作れます。</p>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#F7F9F8] rounded-lg font-bold text-[14px]">キャンセル</button>
                <button type="submit" className="px-6 py-2 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] rounded-lg font-bold text-[14px]">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}