import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Upload, Button,
    Typography, message, List, Checkbox, Row, Col, Empty, Alert, Tag, Spin
} from 'antd';
import { DeleteOutlined, SaveOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';

// IMPORT FIREBASE
import { db, storage } from '../../../api/firebase';
import {
    ref, update, get, query, orderByChild,
    startAt, endAt
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const { Text } = Typography;

// --- KONFIGURASI ---
const FIXED_KATEGORI = 'Penjualan Buku';
const FIXED_TIPE = 'pemasukan';
const DEFAULT_KETERANGAN = 'Pembayaran Tagihan';

const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const generateTransactionId = () => {
    const year = dayjs().format('YYYY');
    const month = dayjs().format('MM');
    const uniquePart = Math.floor(1000 + Math.random() * 9000);
    // Format: PP-202510-1234 (Satu ID untuk banyak invoice)
    return `PP-${year}${month}-${uniquePart}`;
};

const getBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });

// --- LIST ITEM COMPONENT ---
const InvoiceListItem = React.memo(({ item, isSelected, allocation, onToggle, onNominalChange, readOnly }) => {
    const hasDebt = item.sisaTagihan > 0;

    return (
        <List.Item style={{ padding: '8px 12px', background: isSelected ? '#e6f7ff' : '#fff', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ width: '100%' }}>
                <Row align="middle" gutter={8}>
                    <Col flex="auto">
                        <div style={{ fontWeight: 'bold', fontSize: 13, color: 'rgba(0, 0, 0, 0.88)' }}>
                            {item.namaPelanggan}
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>
                            {item.nomorInvoice} • {dayjs(item.tanggal).format('DD MMM YY')}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                            Total: {currencyFormatter(item.totalTagihan)} | 
                            Sisa: <Text type={hasDebt ? "danger" : "secondary"} strong>{currencyFormatter(item.sisaTagihan)}</Text>
                        </div>
                    </Col>

                    <Col>
                        {isSelected ? (
                            <InputNumber
                                value={allocation}
                                onChange={(v) => onNominalChange(v, item.id)}
                                formatter={value => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                                parser={value => value ? value.replace(/\./g, '') : ''}
                                style={{ width: 110, fontSize: 13 }}
                                placeholder="Nominal"
                                min={0}
                                disabled={readOnly}
                            />
                        ) : (
                            <Tag color={hasDebt ? "red" : "green"} style={{ fontSize: 10 }}>
                                {hasDebt ? "BELUM LUNAS" : "LUNAS"}
                            </Tag>
                        )}
                    </Col>

                    <Col>
                        <Checkbox
                            checked={isSelected}
                            onChange={() => onToggle(item.id, item.sisaTagihan)}
                            disabled={readOnly && !isSelected}
                        />
                    </Col>
                </Row>
            </div>
        </List.Item>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
        prev.isSelected === next.isSelected &&
        prev.allocation === next.allocation &&
        prev.readOnly === next.readOnly;
});

const PembayaranForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();

    // --- STATE ---
    const [searchText, setSearchText] = useState('');
    const [fileList, setFileList] = useState([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');

    const [invoiceList, setInvoiceList] = useState([]);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
    const [paymentAllocations, setPaymentAllocations] = useState({});

    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- INITIALIZATION ---
    useEffect(() => {
        if (!open) {
            resetFormState();
        } else {
            setIsSaving(false);
            if (initialValues) {
                // MODE EDIT
                const totalBayar = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);
                form.setFieldsValue({
                    ...initialValues,
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    jumlahTotal: totalBayar,
                    keterangan: initialValues.keterangan || DEFAULT_KETERANGAN 
                });

                let idsToLoad = [];
                let allocations = {};
                let selectedIds = [];

                if (initialValues.detailAlokasi) {
                    Object.entries(initialValues.detailAlokasi).forEach(([key, val]) => {
                        const amount = typeof val === 'object' ? val.amount : val; // Handle format lama/baru
                        idsToLoad.push(key);
                        allocations[key] = amount;
                        selectedIds.push(key);
                    });
                } else if (initialValues.idTransaksi) {
                    // Fallback data lama (single link)
                    const id = initialValues.idTransaksi;
                    idsToLoad.push(id);
                    allocations[id] = totalBayar;
                    selectedIds.push(id);
                }

                setSelectedInvoiceIds(selectedIds);
                setPaymentAllocations(allocations);

                if (idsToLoad.length > 0) {
                    setIsSearching(true);
                    Promise.all(idsToLoad.map(id => get(ref(db, `transaksiJualBuku/${id}`))))
                        .then(snapshots => {
                            let list = [];
                            snapshots.forEach(snap => {
                                if (snap.exists()) {
                                    const val = snap.val();
                                    list.push({
                                        id: snap.key,
                                        ...val,
                                        sisaTagihan: (val.totalTagihan || 0) - (val.jumlahTerbayar || 0)
                                    });
                                }
                            });
                            setInvoiceList(list); 
                        })
                        .finally(() => setIsSearching(false));
                }
                if (initialValues.buktiUrl) {
                    setFileList([{ uid: '-1', name: 'Bukti', status: 'done', url: initialValues.buktiUrl }]);
                }
            } else {
                // MODE BARU
                form.resetFields();
                form.setFieldsValue({ 
                    tanggal: dayjs(), 
                    jumlahTotal: 0,
                    keterangan: DEFAULT_KETERANGAN 
                });
            }
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields();
        setFileList([]);
        setPreviewImage('');
        setSelectedInvoiceIds([]);
        setInvoiceList([]);
        setPaymentAllocations({});
        setSearchText('');
        setIsSearching(false);
    };

    // --- SEARCH LOGIC ---
    const handleSearch = async () => {
        if (!searchText.trim()) return;
        setIsSearching(true);
        const keyword = searchText.toUpperCase().trim();
        
        try {
            // Cari by Nama & No Invoice Paralel
            const [snapName, snapInv] = await Promise.all([
                get(query(ref(db, 'transaksiJualBuku'), orderByChild('namaPelanggan'), startAt(keyword), endAt(keyword + "\uf8ff"))),
                get(query(ref(db, 'transaksiJualBuku'), orderByChild('nomorInvoice'), startAt(keyword), endAt(keyword + "\uf8ff")))
            ]);

            const combinedMap = new Map();
            const processSnapshot = (snap) => {
                if (snap.exists()) {
                    snap.forEach((child) => {
                        const val = child.val();
                        const sisa = (val.totalTagihan || 0) - (val.jumlahTerbayar || 0);
                        // Tampilkan hanya yang belum lunas
                        if (sisa > 0 && val.statusPembayaran !== 'Lunas') {
                            combinedMap.set(child.key, { id: child.key, ...val, sisaTagihan: sisa });
                        }
                    });
                }
            };

            processSnapshot(snapName);
            processSnapshot(snapInv);

            const results = Array.from(combinedMap.values());
            results.sort((a, b) => dayjs(a.tanggal).valueOf() - dayjs(b.tanggal).valueOf()); // Urutkan terlama

            if (results.length === 0) message.info("Tidak ditemukan tagihan belum lunas.");
            else message.success(`Ditemukan ${results.length} tagihan.`);
            
            setInvoiceList(results);

        } catch (err) {
            console.error(err);
            message.error("Gagal mencari data.");
        } finally {
            setIsSearching(false);
        }
    };

    // --- CALCULATION LOGIC ---
    const handleNominalChange = useCallback((val, recordId) => {
        setPaymentAllocations(prev => {
            const newAlloc = { ...prev, [recordId]: val };
            const total = Object.values(newAlloc).reduce((a, b) => a + (Number(b) || 0), 0);
            form.setFieldsValue({ jumlahTotal: total });
            return newAlloc;
        });
    }, [form]);

    const toggleSelection = useCallback((id, sisaTagihan) => {
        setSelectedInvoiceIds(prev => {
            const isSelected = prev.includes(id);
            let newSelected;
            
            setPaymentAllocations(prevAlloc => {
                const newAlloc = { ...prevAlloc };
                if (isSelected) {
                    delete newAlloc[id];
                    newSelected = prev.filter(itemId => itemId !== id);
                } else {
                    newAlloc[id] = sisaTagihan > 0 ? sisaTagihan : 0;
                    newSelected = [...prev, id];
                }
                const total = Object.values(newAlloc).reduce((a, b) => a + (Number(b) || 0), 0);
                form.setFieldsValue({ jumlahTotal: total });
                return newAlloc;
            });
            return newSelected;
        });
    }, [form]);

    const handleSelectAll = useCallback((e) => {
        const checked = e.target.checked;
        const visibleIds = invoiceList.map(i => i.id);

        if (checked) {
            setSelectedInvoiceIds(prev => [...new Set([...prev, ...visibleIds])]);
            setPaymentAllocations(prev => {
                const newAlloc = { ...prev };
                invoiceList.forEach(item => {
                    if (newAlloc[item.id] === undefined) newAlloc[item.id] = item.sisaTagihan > 0 ? item.sisaTagihan : 0;
                });
                const total = Object.values(newAlloc).reduce((a, b) => a + (Number(b) || 0), 0);
                form.setFieldsValue({ jumlahTotal: total });
                return newAlloc;
            });
        } else {
            setSelectedInvoiceIds(prev => prev.filter(id => !visibleIds.includes(id)));
            setPaymentAllocations(prev => {
                const newAlloc = { ...prev };
                visibleIds.forEach(id => delete newAlloc[id]);
                const total = Object.values(newAlloc).reduce((a, b) => a + (Number(b) || 0), 0);
                form.setFieldsValue({ jumlahTotal: total });
                return newAlloc;
            });
        }
    }, [invoiceList, form]);

    const visibleSelectedCount = invoiceList.filter(item => selectedInvoiceIds.includes(item.id)).length;
    const isAllSelected = invoiceList.length > 0 && visibleSelectedCount === invoiceList.length;
    const isIndeterminate = visibleSelectedCount > 0 && visibleSelectedCount < invoiceList.length;

    // --- MAIN SAVE LOGIC (SINGLE ID FOR MULTIPLE INVOICES) ---
    const handleSave = async (values) => {
        if (selectedInvoiceIds.length === 0) return message.error("Pilih minimal satu invoice!");

        setIsSaving(true);
        message.loading({ content: 'Memproses pembayaran...', key: 'saving' });

        try {
            // 1. GENERATE ID TUNGGAL (Sekali saja di luar loop)
            const mutasiId = initialValues?.id || generateTransactionId();
            const timestampNow = dayjs(values.tanggal).valueOf();

            // Upload Bukti
            let buktiUrl = initialValues?.buktiUrl || null;
            if (fileList.length > 0 && fileList[0].originFileObj) {
                const safeName = (values.keterangan || 'bukti').substring(0, 10).replace(/[^a-z0-9]/gi, '_');
                const fileRef = storageRef(storage, `bukti_pembayaran/${safeName}-${uuidv4()}`);
                await uploadBytes(fileRef, fileList[0].originFileObj);
                buktiUrl = await getDownloadURL(fileRef);
            }

            // Persiapan Updates
            const updates = {};
            const detailAlokasiRingkas = {}; // Hanya simpan yang penting
            let namaPelangganUtama = '';
            let listNomorInvoice = [];

            // 2. LOOP SETIAP INVOICE (Update saldo masing-masing)
            for (const invId of selectedInvoiceIds) {
                const amount = Number(paymentAllocations[invId]);
                if (!amount || amount <= 0) continue;

                const invSnap = await get(ref(db, `transaksiJualBuku/${invId}`));
                if (!invSnap.exists()) continue;

                const dbInv = invSnap.val();
                
                // Ambil satu nama untuk judul
                if (!namaPelangganUtama) namaPelangganUtama = dbInv.namaPelanggan;
                listNomorInvoice.push(dbInv.nomorInvoice);

                // Hitung Saldo Baru
                let basePaid = Number(dbInv.jumlahTerbayar || 0);
                if (initialValues) {
                    // Jika edit, kurangi pembayaran lama dulu
                    const oldAlloc = initialValues.detailAlokasi?.[invId]?.amount || 
                                     (initialValues.idTransaksi === invId ? initialValues.jumlah : 0) || 0;
                    basePaid -= Number(oldAlloc);
                }

                const newTotalPaid = basePaid + amount;
                const newStatus = newTotalPaid >= (dbInv.totalTagihan || 0) ? 'Lunas' : 'Belum';

                // Update Data Invoice
                updates[`transaksiJualBuku/${invId}/jumlahTerbayar`] = newTotalPaid;
                updates[`transaksiJualBuku/${invId}/statusPembayaran`] = newStatus;
                
                // Link Riwayat Pembayaran di Invoice (Mengarah ke mutasiId yang SAMA)
                updates[`transaksiJualBuku/${invId}/riwayatPembayaran/${mutasiId}`] = {
                    tanggal: timestampNow,
                    jumlah: amount,
                    mutasiId: mutasiId,
                    keterangan: values.keterangan || DEFAULT_KETERANGAN
                };

                // Masukkan ke detail alokasi (Ringkes)
                detailAlokasiRingkas[invId] = {
                    amount: amount,
                    noInvoice: dbInv.nomorInvoice
                };
            }

            // 3. BUAT DATA MUTASI (SATU DATA SAJA)
            const dataMutasi = {
                id: mutasiId,
                tipe: FIXED_TIPE,
                kategori: FIXED_KATEGORI,
                tanggal: timestampNow,
                jumlah: values.jumlahTotal, 
                keterangan: values.keterangan || DEFAULT_KETERANGAN,
                buktiUrl: buktiUrl,
                namaPelanggan: namaPelangganUtama + (selectedInvoiceIds.length > 1 ? '' : ''), // Nama + dkk jika banyak
                
                // KUNCI: Data ringkas, 1 ID, tapi mencakup banyak invoice
                detailAlokasi: detailAlokasiRingkas, 
                nomorInvoice: listNomorInvoice.join(', '), // Gabungan nomor invoice
                
                index_kategori_tanggal: `Penjualan Buku_${timestampNow}`,
                nomorBuktiDisplay: mutasiId
            };

            updates[`mutasi/${mutasiId}`] = dataMutasi;
            updates[`historiPembayaran/${mutasiId}`] = dataMutasi;

            await update(ref(db), updates);
            message.success({ content: 'Pembayaran tersimpan (Single ID)!', key: 'saving' });
            onCancel();

        } catch (error) {
            console.error(error);
            message.error({ content: `Gagal: ${error.message}`, key: 'saving' });
        } finally {
            setIsSaving(false);
        }
    };

    // --- DELETE LOGIC ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus Pembayaran?',
            content: 'Saldo akan dikembalikan ke masing-masing invoice.',
            okText: 'Hapus',
            okType: 'danger',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const mutasiId = initialValues.id;
                    const updates = {};
                    
                    // Hapus Mutasi Utama
                    updates[`mutasi/${mutasiId}`] = null;
                    updates[`historiPembayaran/${mutasiId}`] = null;

                    // Kembalikan Saldo Invoice
                    const allocations = initialValues.detailAlokasi || {};
                    // Backward compatibility untuk data lama
                    if (Object.keys(allocations).length === 0 && initialValues.idTransaksi) {
                        allocations[initialValues.idTransaksi] = { amount: initialValues.jumlah };
                    }

                    for (const [invId, val] of Object.entries(allocations)) {
                        const amountToDelete = typeof val === 'object' ? val.amount : val;
                        const invSnap = await get(ref(db, `transaksiJualBuku/${invId}`));
                        
                        if (invSnap.exists()) {
                            const invData = invSnap.val();
                            const currentPaid = Number(invData.jumlahTerbayar || 0);
                            const newPaid = Math.max(0, currentPaid - Number(amountToDelete));
                            
                            updates[`transaksiJualBuku/${invId}/jumlahTerbayar`] = newPaid;
                            updates[`transaksiJualBuku/${invId}/statusPembayaran`] = newPaid >= (invData.totalTagihan || 0) ? 'Lunas' : 'Belum';
                            updates[`transaksiJualBuku/${invId}/riwayatPembayaran/${mutasiId}`] = null;
                        }
                    }

                    await update(ref(db), updates);
                    message.success('Pembayaran dihapus.');
                    onCancel();
                } catch (error) {
                    message.error("Gagal hapus: " + error.message);
                } finally {
                    setIsSaving(false);
                }
            }
        });
    };

    return (
        <>
            {contextHolder}
            <Modal
                open={open}
                title={initialValues ? "Edit Pembayaran" : "Input Pembayaran Baru"}
                onCancel={onCancel}
                width={700}
                maskClosable={false}
                footer={[
                    initialValues && <Button key="del" danger icon={<DeleteOutlined />} onClick={handleDelete}>Hapus</Button>,
                    <Button key="back" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    <Button key="submit" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>Simpan</Button>
                ]}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    {!initialValues ? (
                        <div style={{ marginBottom: 16 }}>
                            <Alert message="Pilih invoice sebanyak yang dibayar. Sistem akan membuat 1 ID Pembayaran Gabungan." type="info" showIcon style={{marginBottom: 8}} />
                            <Input.Search
                                placeholder="Cari Nama Pelanggan / No Invoice lalu Tekan ENTER"
                                enterButton="Cari Tagihan"
                                size="large"
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                onSearch={handleSearch}
                                loading={isSearching}
                            />
                        </div>
                    ) : (
                         <Alert message="Mode Edit" description="Anda sedang mengedit data pembayaran yang sudah tersimpan." type="warning" showIcon style={{marginBottom: 16}} />
                    )}

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="tanggal" label="Tanggal Pembayaran" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="jumlahTotal" label="Total Dibayarkan">
                                <InputNumber
                                    style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }}
                                    formatter={v => v ? `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : 'Rp 0'}
                                    parser={v => v ? v.replace(/\D/g, '') : ''}
                                    readOnly
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {invoiceList.length > 0 && !initialValues && (
                        <div style={{ padding: '8px 12px', background: '#f5f5f5', border: '1px solid #f0f0f0', borderBottom: 'none', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
                            <Checkbox checked={isAllSelected} indeterminate={isIndeterminate} onChange={handleSelectAll}>
                                <b>Pilih Semua ({invoiceList.length})</b>
                            </Checkbox>
                        </div>
                    )}

                    <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: invoiceList.length > 0 ? '0 0 8px 8px' : '8px', marginBottom: 16, backgroundColor: '#fafafa' }}>
                        {isSearching ? <div style={{ padding: 20, textAlign: 'center' }}><Spin tip="Mencari data..." /></div> : 
                        invoiceList.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada data" style={{margin: '20px 0'}} /> : 
                        (
                            <List
                                dataSource={invoiceList}
                                renderItem={(item) => (
                                    <InvoiceListItem 
                                        key={item.id}
                                        item={item} 
                                        isSelected={selectedInvoiceIds.includes(item.id)}
                                        allocation={paymentAllocations[item.id]}
                                        onToggle={toggleSelection}
                                        onNominalChange={handleNominalChange}
                                        readOnly={!!initialValues && !selectedInvoiceIds.includes(item.id)} 
                                    />
                                )}
                            />
                        )}
                    </div>

                    <Form.Item name="keterangan" label="Catatan">
                        <Input.TextArea rows={1} placeholder="Keterangan pembayaran..." />
                    </Form.Item>
                    
                    <Form.Item name="bukti" label="Bukti Transfer (Opsional)">
                        <Upload accept="image/*" listType="picture-card" maxCount={1} fileList={fileList} 
                            onPreview={async (file) => {
                                if (!file.url && !file.preview) file.preview = await getBase64(file.originFileObj);
                                setPreviewImage(file.url || file.preview);
                                setPreviewOpen(true);
                            }}
                            onChange={({ fileList }) => setFileList(fileList)} beforeUpload={() => false}>
                            {fileList.length < 1 && <div><PlusOutlined /><div style={{marginTop: 8}}>Upload</div></div>}
                        </Upload>
                    </Form.Item>
                </Form>
            </Modal>
            <Modal open={previewOpen} footer={null} onCancel={() => setPreviewOpen(false)}>
                <img alt="bukti" style={{ width: '100%' }} src={previewImage} />
            </Modal>
        </>
    );
};

export default PembayaranForm;