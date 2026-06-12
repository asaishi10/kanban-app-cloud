import React, { useState, useRef } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus } from 'lucide-react';

const generateId = () => Math.random().toString(36).substr(2, 9);

// 初期データ
const initialCategories = [
  { id: 'c1', name: '仕事' },
  { id: 'c2', name: 'プライベート' },
  { id: 'c3', name: 'アイデア' }
];

const initialNotes = [
  {
    id: '1',
    title: 'プロジェクト企画書の作成',
    categoryId: 'c1',
    isCompleted: false,
    blocks: [
      { id: 'b1', type: 'text', content: '明日の会議までに骨子をまとめる。' },
      { id: 'b2', type: 'list', content: '目的の明確化' },
      { id: 'b3', type: 'list', content: '競合リサーチ' },
      { id: 'b4', type: 'checkbox', content: 'ドラフト作成', checked: false },
      { id: 'b5', type: 'checkbox', content: 'レビュー依頼', checked: false },
    ]
  },
  {
    id: '2',
    title: 'デザイン案の検討',
    categoryId: 'c1',
    isCompleted: false,
    blocks: [
      { id: 'b6', type: 'text', content: '新しいUIのコンセプト案を作成する。\n参考になりそうなサイトをいくつかピックアップしておくこと。' },
    ]
  },
  {
    id: '3',
    title: '週末の買い物',
    categoryId: 'c2',
    isCompleted: false,
    blocks: [
      { id: 'b7', type: 'checkbox', content: 'コーヒー豆', checked: false },
      { id: 'b8', type: 'checkbox', content: '洗剤', checked: false },
      { id: 'b9', type: 'checkbox', content: '卵', checked: true },
      { id: 'b10', type: 'checkbox', content: 'ティッシュ', checked: false },
    ]
  },
  {
    id: '4',
    title: '過去の資料整理',
    categoryId: 'c1',
    isCompleted: true,
    blocks: [
      { id: 'b11', type: 'text', content: '先月のプロジェクト資料をGoogle Driveのアーカイブフォルダに移動させる。' },
    ]
  },
];

export default function App() {
  const [categories, setCategories] = useState(initialCategories);
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0]?.id);
  const [notes, setNotes] = useState(initialNotes);

  // 完了済みの表示切り替えステート
  const [showCompleted, setShowCompleted] = useState(false);

  // カテゴリー編集用ステート
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // モーダル管理（新規作成・編集共通）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null); // nullなら新規

  // フォームステート（ブロックベース）
  const [formData, setFormData] = useState({
    title: '',
    categoryId: '',
    blocks: []
  });

  const fileInputRef = useRef(null);

  // ドラッグ＆ドロップ状態
  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverNoteId, setDragOverNoteId] = useState(null);

  // --- カテゴリー（タブ）操作 ---
  const handleAddCategory = () => {
    const newCategory = { id: generateId(), name: '新しいカテゴリー' };
    setCategories([...categories, newCategory]);
    setActiveCategoryId(newCategory.id);
    setEditingCategoryId(newCategory.id);
    setEditingCategoryName(newCategory.name);
  };

  const saveCategoryName = (id) => {
    if (editingCategoryName.trim() === '') return;
    setCategories(categories.map(c => 
      c.id === id ? { ...c, name: editingCategoryName.trim() } : c
    ));
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = (id) => {
    if (categories.length === 1) return; // 最低1つは残す
    setCategories(categories.filter(c => c.id !== id));
    if (activeCategoryId === id) {
      setActiveCategoryId(categories.find(c => c.id !== id).id);
    }
  };

  // --- メモの操作 ---
  const openAddModal = () => {
    setEditingNote(null);
    setFormData({
      title: '',
      categoryId: activeCategoryId,
      blocks: [{ id: generateId(), type: 'text', content: '' }] // 初期ブロックを1つ用意
    });
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setEditingNote(note);
    // blocksが存在しない古いデータ対応のフォールバック
    const initialBlocks = note.blocks || [{ id: generateId(), type: 'text', content: note.content || '' }];
    setFormData({ ...note, blocks: initialBlocks });
    setIsModalOpen(true);
  };

  const saveNote = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    if (editingNote) {
      setNotes(notes.map(n => n.id === editingNote.id ? { ...formData } : n));
    } else {
      setNotes([...notes, { ...formData, id: generateId(), isCompleted: false }]);
    }
    setIsModalOpen(false);
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
    setIsModalOpen(false);
  };

  const toggleComplete = (e, id) => {
    e.stopPropagation();
    setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
  };

  const handleBoardBlockCheckToggle = (e, noteId, blockId) => {
    e.stopPropagation();
    setNotes(notes.map(note => {
      if (note.id !== noteId) return note;
      return {
        ...note,
        blocks: note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b)
      };
    }));
  };

  // --- ブロックエディタの操作 ---
  const addBlock = (type) => {
    setFormData(prev => ({
      ...prev,
      blocks: [...prev.blocks, { id: generateId(), type, content: '', checked: false }]
    }));
  };

  const updateBlock = (blockId, updates) => {
    setFormData(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
    }));
  };

  const removeBlock = (blockId) => {
    setFormData(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== blockId)
    }));
  };

  const handleTextareaResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return; // 変換中のEnterは無視

    if (e.key === 'Enter' && !e.shiftKey) {
      // リストやチェックボックスの場合は、Enterで次の項目を自動生成
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newBlock = { id: generateId(), type: blockType, content: '', checked: false };
        const newBlocks = [...formData.blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        setFormData({ ...formData, blocks: newBlocks });
        
        setTimeout(() => {
          document.getElementById(`block-input-${newBlock.id}`)?.focus();
        }, 0);
      }
    }
    
    // 入力が空の状態でBackspaceを押したらブロックを削除して前に戻る
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      removeBlock(formData.blocks[index].id);
      if (index > 0) {
        document.getElementById(`block-input-${formData.blocks[index - 1].id}`)?.focus();
      }
    }
  };

  // --- 画像操作 ---
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({
        ...prev,
        blocks: [...prev.blocks, { id: generateId(), type: 'image', content: reader.result }]
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = null; // 同じファイルを再選択可能にする
  };

  const handlePaste = (e, index) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onloadend = () => {
          const newBlock = { id: generateId(), type: 'image', content: reader.result };
          const newBlocks = [...formData.blocks];
          // ペーストしたブロックの直後に画像を挿入
          newBlocks.splice(index + 1, 0, newBlock);
          setFormData({ ...formData, blocks: newBlocks });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // --- ドラッグ＆ドロップ処理 ---
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id);
    setDraggedNoteId(id);
    setTimeout(() => {
      const el = document.getElementById(`note-${id}`);
      if (el) el.classList.add('opacity-40');
    }, 0);
  };

  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null);
    setDragOverNoteId(null);
    const el = document.getElementById(`note-${id}`);
    if (el) el.classList.remove('opacity-40');
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (dragOverNoteId !== id && draggedNoteId !== id) {
      setDragOverNoteId(id);
    }
  };

  const handleDragLeave = (e, id) => {
    if (dragOverNoteId === id) {
      setDragOverNoteId(null);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverNoteId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId) return;

    setNotes(prevNotes => {
      // 現在のカテゴリーのノートと、それ以外のノートを分ける
      const otherNotes = prevNotes.filter(n => n.categoryId !== activeCategoryId);
      const categoryNotes = prevNotes.filter(n => n.categoryId === activeCategoryId);
      
      const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
      const targetIndex = categoryNotes.findIndex(n => n.id === targetId);
      
      if(sourceIndex === -1 || targetIndex === -1) return prevNotes;

      const newCategoryNotes = [...categoryNotes];
      const [removed] = newCategoryNotes.splice(sourceIndex, 1);
      
      // ドロップした対象の位置に挿入して順序を入れ替える
      newCategoryNotes.splice(targetIndex, 0, removed);

      return [...otherNotes, ...newCategoryNotes];
    });
  };

  // 完了済みの状態を考慮してノートをフィルタリング
  const activeNotes = notes.filter(n => 
    n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted)
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />

      {/* ヘッダー＆タブ */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Kanban Notes
          </h1>
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規メモ
          </button>
        </div>

        {/* カテゴリー（タブ）ナビゲーションと右端のトグル */}
        <div className="px-6 flex items-end gap-2 overflow-x-auto custom-scrollbar pb-0">
          {categories.map(category => (
            <div
              key={category.id}
              className={`group flex items-center gap-2 px-4 py-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap
                ${activeCategoryId === category.id 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }
              `}
              onClick={() => setActiveCategoryId(category.id)}
            >
              {editingCategoryId === category.id ? (
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  onBlur={() => saveCategoryName(category.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)}
                  autoFocus
                  className="border border-indigo-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              ) : (
                <>
                  <span className="font-semibold text-sm">{category.name}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 transition-opacity rounded"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {categories.length > 1 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={handleAddCategory}
            className="flex items-center gap-1 px-4 py-3 text-slate-500 hover:text-indigo-600 border-b-2 border-transparent transition-colors font-medium text-sm whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            追加
          </button>

          {/* 完了済み表示トグル */}
          <div className="ml-auto flex items-center mb-3 pr-2 flex-shrink-0">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 hover:text-slate-700 transition-colors select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="font-medium">完了済みを表示</span>
            </label>
          </div>
        </div>
      </header>

      {/* メインボード（グリッド配置） */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto h-full">
          {activeNotes.length === 0 ? (
            <div 
              onClick={() => openAddModal()}
              className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer max-w-lg mx-auto mt-10"
            >
              <div className="text-lg font-medium mb-2">メモがありません</div>
              <div className="text-sm">＋ ここをクリックして新しいメモを追加</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start pb-10">
              {activeNotes.map((note) => {
                // サムネイル用の最初の画像を取得
                const firstImageBlock = note.blocks.find(b => b.type === 'image');
                
                return (
                  <div
                    id={`note-${note.id}`}
                    key={note.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note.id)}
                    onDragEnd={(e) => handleDragEnd(e, note.id)}
                    onDragOver={(e) => handleDragOver(e, note.id)}
                    onDragLeave={(e) => handleDragLeave(e, note.id)}
                    onDrop={(e) => handleDrop(e, note.id)}
                    onClick={() => openEditModal(note)}
                    className={`group rounded-xl p-4 border shadow-sm transition-all cursor-pointer relative
                      ${dragOverNoteId === note.id ? 'border-indigo-500 ring-2 ring-indigo-200 scale-[1.02] z-10' : 'hover:shadow-md hover:border-indigo-400'}
                      ${note.isCompleted ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100' : 'bg-white border-slate-200'}
                    `}
                  >
                    {/* 画像サムネイル */}
                    {firstImageBlock && (
                      <div className="mb-3 rounded-lg overflow-hidden h-32 bg-slate-100 border border-slate-200 flex items-center justify-center opacity-90">
                        <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className={`font-semibold leading-snug line-clamp-2 pr-6 ${note.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {note.title}
                      </h3>
                      <button
                        onClick={(e) => toggleComplete(e, note.id)}
                        className={`absolute top-3 right-3 transition-colors p-1 rounded-full shadow-sm border z-10
                          ${note.isCompleted ? 'text-green-500 bg-green-50 border-green-200 hover:bg-green-100' : 'text-slate-300 bg-white border-slate-100 hover:text-green-500 hover:border-green-300'}`}
                        title={note.isCompleted ? "未完了に戻す" : "完了にする"}
                      >
                        {note.isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* 本文プレビュー（高さ制限あり・フェードアウト） */}
                    <div className="relative overflow-hidden max-h-48 rounded-b-lg">
                      <div className="space-y-0.5 text-[15px] pb-6">
                        {note.blocks.map(block => (
                          <div key={block.id}>
                            {block.type === 'text' && <div className={`whitespace-pre-wrap leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>{block.content}</div>}
                            {block.type === 'list' && (
                              <div className={`flex items-start gap-1.5 leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className="text-slate-400 font-bold mt-0.5">•</span>
                                <span>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'checkbox' && (
                              <div 
                                className="flex items-start gap-2 cursor-pointer group/check leading-relaxed" 
                                onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}
                              >
                                {block.checked 
                                  ? <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-1 flex-shrink-0 group-hover/check:opacity-70" /> 
                                  : <Circle className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0 group-hover/check:text-indigo-400" />
                                }
                                <span className={`${block.checked || note.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'} leading-snug`}>
                                  {block.content}
                                </span>
                              </div>
                            )}
                            {block.type === 'image' && !firstImageBlock && (
                              <div className="text-xs text-slate-400 flex items-center gap-1 my-1">
                                <ImageIcon className="w-3 h-3"/> 画像
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* グラデーションで下部をフェードアウト */}
                      <div className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-slate-50 to-transparent' : 'bg-gradient-to-t from-white to-transparent'}`}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ノート追加・編集モーダル（ブロックエディタ） */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingNote ? 'メモを編集' : '新しいメモ'}
              </h2>
              <div className="flex items-center gap-2">
                {editingNote && (
                  <button
                    type="button"
                    onClick={() => deleteNote(editingNote.id)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:bg-slate-200 p-2 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* モーダルボディ（エディタ部分）とフッターを包含するフォーム */}
            <form onSubmit={saveNote} className="flex-1 overflow-hidden flex flex-col">
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col">
                <div className="space-y-6 flex-1">
                  {/* タイトル */}
                  <div>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-2 py-2 text-2xl font-bold text-slate-800 border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none transition-colors bg-transparent placeholder:text-slate-300"
                      placeholder="タイトルを入力..."
                    />
                  </div>

                  {/* メタ情報（カテゴリー） */}
                  <div className="flex gap-4">
                    <div className="flex-1 max-w-xs">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">カテゴリー</label>
                      <select
                        value={formData.categoryId}
                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                      >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 本文（ブロックエディタ） */}
                  <div className="pt-2 border-t border-slate-100 relative">
                    <div className="space-y-0 pb-10">
                      {formData.blocks.map((block, index) => (
                        <div key={block.id} className="flex gap-2 items-start group">
                          
                          {/* 左側の装飾アイコン */}
                          <div className="w-6 flex justify-center mt-1 flex-shrink-0">
                            {block.type === 'list' && <div className="text-slate-400 font-bold">•</div>}
                            {block.type === 'checkbox' && (
                              <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                                {block.checked ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5 text-slate-300 hover:text-indigo-300" />}
                              </div>
                            )}
                          </div>
                          
                          {/* メインコンテンツ */}
                          <div className="flex-1">
                            {block.type === 'image' ? (
                              <div className="relative inline-block my-2">
                                <img src={block.content} alt="添付画像" className="max-w-full h-auto rounded-lg border border-slate-200" />
                              </div>
                            ) : (
                              <textarea
                                id={`block-input-${block.id}`}
                                value={block.content}
                                onChange={(e) => {
                                  handleTextareaResize(e);
                                  updateBlock(block.id, { content: e.target.value });
                                }}
                                onKeyDown={(e) => handleKeyDown(e, index, block.type)}
                                onPaste={(e) => handlePaste(e, index)}
                                className={`w-full bg-transparent resize-none outline-none py-1 min-h-[28px] overflow-hidden leading-relaxed
                                  ${block.type === 'checkbox' && block.checked ? 'text-slate-400 line-through' : 'text-slate-700'}
                                  text-[15px]
                                `}
                                rows={1}
                                placeholder={block.type === 'text' ? "テキストを入力するか、画像をペースト..." : "項目を入力..."}
                              />
                            )}
                          </div>

                          {/* 削除ボタン */}
                          <button 
                            type="button" 
                            onClick={() => removeBlock(block.id)} 
                            className="opacity-0 group-hover:opacity-100 mt-1 p-1 text-slate-300 hover:text-red-500 rounded transition-opacity"
                            title="このブロックを削除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* ブロック追加ツールバー */}
                    <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm py-3 border-t border-slate-100 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase mr-2">追加</span>
                      <button type="button" onClick={() => addBlock('text')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                        <AlignLeft className="w-4 h-4" /> テキスト
                      </button>
                      <button type="button" onClick={() => addBlock('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                        <List className="w-4 h-4" /> リスト
                      </button>
                      <button type="button" onClick={() => addBlock('checkbox')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                        <CheckSquare className="w-4 h-4" /> チェック
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                        <ImageIcon className="w-4 h-4" /> 画像
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* モーダルフッター */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}