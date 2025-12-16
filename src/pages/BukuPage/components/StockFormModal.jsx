import React, { useState, useEffect, useMemo } from 'react';
import { 
    Modal, Form, Input, InputNumber, Row, Col, Grid, message, Spin, 
    Alert, Typography, Table, Button, DatePicker, Space, Empty, Tag 
} from 'antd';
import { 
    ref, push, serverTimestamp, runTransaction, query, orderByChild, onValue, set, equalTo 
} from 'firebase/database';
import { PrinterOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { db } from '../../../api/firebase';
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StokFormModal = ({ open, onCancel, buku }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // State Data History
    const [fullHistory, setFullHistory] = useState([]); 
    const [historyLoading, setHistoryLoading] = useState(false);
    
    // State UI & Filter
    const screens = Grid.useBreakpoint();
    const [dateRange, setDateRange] = useState(null);
    const [searchText, setSearchText] = useState(''); 
    
    // State Lokal untuk tampilan stok instan
    const [localStokDisplay, setLocalStokDisplay] = useState(0); 

    // State PDF
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);

    // --- 1. INISIALISASI ---
    useEffect(() => {
        if (open && buku) {
            setLocalStokDisplay(Number(buku.stok) || 0);
            form.resetFields();
            setDateRange(null); 
            setSearchText(''); 
            setPdfPreviewUrl(null);
        } else if (!open) {
            setFullHistory([]);
        }
    }, [open, buku, form]);

    // --- 2. FETCH HISTORY DATA ---
    useEffect(() => {
        if (open && buku?.id) {
            setHistoryLoading(true);
            
            const bookHistoryRef = query(
                ref(db, 'stock_history'), 
                orderByChild('productsId'),
                equalTo(buku.id)
            );

            const unsubscribe = onValue(bookHistoryRef, (snapshot) => {
                const data = snapshot.val();
                const loadedHistory = data
                    ? Object.keys(data).map((key) => ({ id: key, ...data[key] }))
                    : [];
                
                loadedHistory.sort((a, b) => {
                    const timeA = a.tanggal || a.timestamp || 0;
                    const timeB = b.tanggal || b.timestamp || 0;
                    return timeB - timeA;
                });
                
                setFullHistory(loadedHistory);
                setHistoryLoading(false);
            }, (error) => {
                console.error("Firebase Read Error:", error);
                message.error("Gagal memuat riwayat.");
                setHistoryLoading(false);
            });

            return () => unsubscribe();
        }
    }, [open, buku?.id]);

    // --- 3. FILTERING LOGIC ---
    const filteredHistory = useMemo(() => {
        let data = fullHistory;

        if (dateRange) {
            const [start, end] = dateRange;
            const startTime = start.startOf('day').valueOf();
            const endTime = end.endOf('day').valueOf();

            data = data.filter((item) => {
                const itemTime = item.tanggal || item.timestamp;
                return itemTime >= startTime && itemTime <= endTime;
            });
        }

        if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            data = data.filter((item) => {
                const ket = (item.keterangan || '').toLowerCase();
                const refId = (item.refId || '').toLowerCase();
                const nama = (item.nama || '').toLowerCase();
                
                return ket.includes(lowerSearch) || 
                       refId.includes(lowerSearch) ||
                       nama.includes(lowerSearch);
            });
        }

        return data;
    }, [fullHistory, dateRange, searchText]);

    // --- 4. UPDATE STOK MANUAL ---
    // --- 4. UPDATE STOK MANUAL (REVISED) ---
// --- 4. UPDATE STOK MANUAL (DIPERBAIKI) ---
const handleStokUpdate = async (values) => {
    const { jumlah, keterangan } = values;
    
    // Pastikan konversi ke Number aman
    const jumlahNum = Number(jumlah); 

    // Validasi input
    if (isNaN(jumlahNum) || jumlahNum === 0) {
        message.error('Jumlah tidak valid atau 0.');
        return;
    }

    setLoading(true);
    try {
        const productRef = ref(db, `products/${buku.id}`);
        console.log("Memulai transaksi untuk:", buku.id, "Jumlah:", jumlahNum);

        // 1. Jalankan Transaksi (Update Produk)
        const result = await runTransaction(productRef, (currentData) => {
            if (!currentData) {
                // Jika data produk tidak ada, transaksi batal
                return; 
            }

            const currentStok = Number(currentData.stok) || 0;
            const nextStok = currentStok + jumlahNum;

            // Debugging: Cek di console browser
            console.log(`Stok Awal: ${currentStok}, Perubahan: ${jumlahNum}, Menjadi: ${nextStok}`);

            // Hapus baris di bawah ini jika kamu benar-benar membolehkan stok minus
            // if (nextStok < 0) throw new Error("Stok tidak boleh kurang dari 0");

            return {
                ...currentData,
                stok: nextStok,
                updatedAt: serverTimestamp()
            };
        });

        // 2. Cek Hasil Transaksi
        if (result.committed) {
            const finalData = result.snapshot.val();
            const stokAkhir = Number(finalData.stok);
            // Kalkulasi mundur untuk mendapatkan stok awal yang akurat
            const stokAwal = stokAkhir - jumlahNum; 

            const refIdManual = `MNL-${dayjs().format('YYMMDDHHmm')}`;
            
            // Tentukan keterangan default jika kosong
            let finalKeterangan = keterangan;
            if (!finalKeterangan) {
                finalKeterangan = jumlahNum > 0 ? 'Koreksi Stok Masuk' : 'Koreksi Stok Keluar';
            }

            // Persiapan Data History
            const historyData = {
                bukuId: buku.id,
                nama: "ADMIN", // Bisa diganti user.displayName jika ada auth
                refId: refIdManual,
                judul: buku.nama || buku.judul || 'Tanpa Judul',
                perubahan: jumlahNum,     // Simpan angka asli (bisa negatif)
                stokAwal: stokAwal,
                stokAkhir: stokAkhir,
                keterangan: finalKeterangan,
                tanggal: Date.now(),      // Gunakan timestamp JS agar sorting klien aman
                createdAt: serverTimestamp(), // Timestamp server
                type: jumlahNum > 0 ? 'in' : 'out' // Opsional: flag tipe helper
            };

            // 3. Simpan ke History
            const newHistoryRef = push(ref(db, 'stock_history'));
            await set(newHistoryRef, historyData);

            // Update UI Lokal
            setLocalStokDisplay(stokAkhir);
            message.success(`Stok berhasil diupdate. Sisa stok: ${numberFormatter(stokAkhir)}`);
            form.resetFields();
        } else {
            console.warn("Transaksi tidak committed. Mungkin data produk tidak ditemukan.");
            message.error("Gagal update: Data produk tidak ditemukan atau transaksi dibatalkan.");
        }

    } catch (error) {
        console.error("Error Transaction Full:", error);
        // Cek spesifik jika error dari Firebase Rules
        if (error.message.includes("permission_denied") || error.code === "PERMISSION_DENIED") {
            message.error("Gagal: Firebase Rules memblokir stok minus. Cek Console Firebase.");
        } else {
            message.error('Gagal update stok: ' + error.message);
        }
    } finally {
        setLoading(false);
    }
};

    // --- 5. LOGIC PDF (UPDATED: SPLIT MASUK/KELUAR) ---
    const handleGeneratePdf = () => {
        if (filteredHistory.length === 0) {
            message.warning("Tidak ada data untuk dicetak.");
            return;
        }

        setIsPdfGenerating(true);
        setIsPdfModalOpen(true);

        setTimeout(() => {
            try {
                const doc = new jsPDF();
                
                doc.setFontSize(16);
                doc.text(`Kartu Stok Barang`, 14, 20);
                
                const judulBuku = buku.nama || buku.judul || 'Tanpa Judul';

                doc.setFontSize(11);
                doc.setFont("helvetica", "bold");
                doc.text(`${judulBuku}`, 14, 28);
                doc.setFont("helvetica", "normal");

                doc.setFontSize(10);
                doc.text(`ID: ${buku.id || '-'}   |   Penerbit: ${buku.penerbit || '-'}`, 14, 34);
                
                // HEADER UPDATE
                const tableHead = [['Tanggal', 'Ref ID', 'Oleh', 'Awal', 'Masuk', 'Keluar', 'Akhir', 'Keterangan']];
                
                const tableBody = filteredHistory.map((item) => {
                    const timeVal = item.tanggal || item.timestamp;
                    const awal = item.stokAwal ?? item.stokSebelum ?? 0;
                    const akhir = item.stokAkhir ?? item.stokSesudah ?? 0;
                    const perubahan = Number(item.perubahan);

                    // LOGIC SPLIT PDF
                    const masuk = perubahan > 0 ? numberFormatter(perubahan) : '-';
                    const keluar = perubahan < 0 ? numberFormatter(Math.abs(perubahan)) : '-';

                    return [
                        dayjs(timeVal).format('DD/MM/YY HH:mm'),
                        item.refId || '-',
                        item.nama || '-',
                        numberFormatter(awal),
                        masuk,  // Kolom Masuk
                        keluar, // Kolom Keluar
                        numberFormatter(akhir),
                        item.keterangan || '-' 
                    ];
                });

                autoTable(doc, {
                    startY: 40,
                    head: tableHead,
                    body: tableBody,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
                    headStyles: { fillColor: [41, 128, 185], halign: 'center', textColor: 255 },
                    // COLUMN STYLES UPDATE
                    columnStyles: {
                        0: { cellWidth: 25 }, // Tanggal
                        1: { cellWidth: 25 }, // Ref ID
                        2: { cellWidth: 20 }, // Oleh
                        3: { halign: 'right', cellWidth: 15 }, // Awal
                        4: { halign: 'right', cellWidth: 15, textColor: [0, 128, 0] }, // Masuk (Green text optional)
                        5: { halign: 'right', cellWidth: 15, textColor: [255, 0, 0] }, // Keluar (Red text optional)
                        6: { halign: 'right', cellWidth: 15, fontStyle: 'bold' }, // Akhir
                        7: { cellWidth: 'auto' } // Ket
                    }
                });

                const blob = doc.output('blob');
                setPdfPreviewUrl(URL.createObjectURL(blob));
            } catch (error) {
                console.error("PDF Error:", error);
                message.error("Gagal membuat PDF.");
            } finally {
                setIsPdfGenerating(false);
            }
        }, 100);
    };

    // --- KOLOM TABEL UI (UPDATED: SPLIT MASUK/KELUAR) ---
    const modalHistoryColumns = [
        { 
            title: 'Waktu', 
            dataIndex: 'tanggal', 
            width: 130, 
            render: (val, record) => timestampFormatter(val || record.timestamp) 
        },
        { 
            title: 'Ref ID', 
            dataIndex: 'refId', 
            width: 120, 
            render: (text) => text ? <Tag color="geekblue">{text}</Tag> : '-'
        },
        { 
            title: 'Oleh', 
            dataIndex: 'nama', 
            width: 90,
            render: (text) => (
                <Space size={4}>
                    <UserOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                    <Text className="text-xs">{text || '-'}</Text>
                </Space>
            )
        },
        { 
            title: 'Awal', 
            key: 'stokAwal', 
            width: 70, 
            align: 'right', 
            render: (_, record) => numberFormatter(record.stokAwal ?? record.stokSebelum) 
        },
        // KOLOM MASUK
        { 
            title: 'Masuk', 
            dataIndex: 'perubahan', 
            key: 'masuk',
            width: 80, 
            align: 'right',
            render: (val) => {
                const num = Number(val);
                if (num > 0) {
                    return <Text strong style={{ color: '#52c41a' }}>{numberFormatter(num)}</Text>;
                }
                return <Text type="secondary">-</Text>;
            }
        },
        // KOLOM KELUAR
        { 
            title: 'Keluar', 
            dataIndex: 'perubahan', 
            key: 'keluar',
            width: 80, 
            align: 'right',
            render: (val) => {
                const num = Number(val);
                if (num < 0) {
                    // Gunakan Math.abs agar tidak menampilkan tanda minus ganda (misal: -5 jadi 5 di kolom keluar)
                    return <Text strong style={{ color: '#f5222d' }}>{numberFormatter(Math.abs(num))}</Text>;
                }
                return <Text type="secondary">-</Text>;
            }
        },
        { 
            title: 'Akhir', 
            key: 'stokAkhir', 
            width: 70, 
            align: 'right', 
            render: (_, record) => numberFormatter(record.stokAkhir ?? record.stokSesudah) 
        },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            render: (text) => {
                if (!searchText) return text;
                const parts = (text || '').split(new RegExp(`(${searchText})`, 'gi'));
                return (
                    <span>
                        {parts.map((part, i) => 
                            part.toLowerCase() === searchText.toLowerCase() 
                                ? <span key={i} style={{ backgroundColor: '#ffc069' }}>{part}</span> 
                                : part
                        )}
                    </span>
                );
            }
        },
    ];

    if (!buku) return null;

    const judulDisplay = buku.nama || buku.judul || 'Tanpa Judul';

    return (
        <>
            <Modal
                title={`Kartu Stok: ${buku.id} - ${judulDisplay} -  ${buku.peruntukan}`}
                open={open}
                onCancel={onCancel}
                footer={null}
                destroyOnClose
                width={1300}
                style={{ top: 20 }}
            >
                <Spin spinning={loading}>
                    <Row gutter={24}>
                        {/* KIRI: FORM UPDATE */}
                        <Col lg={7} xs={24} style={{ borderRight: screens.lg ? '1px solid #f0f0f0' : 'none', marginBottom: 24 }}>
                            <Title level={5}>Update Stok Manual</Title>
                            
                            <Alert 
                                message={`Stok Saat Ini: ${numberFormatter(localStokDisplay)}`} 
                                type="info" 
                                showIcon 
                                style={{ marginBottom: 16 }} 
                            />
                            
                            <Form form={form} layout="vertical" onFinish={handleStokUpdate} initialValues={{ jumlah: null, keterangan: '' }}>
                                <Form.Item name="jumlah" label="Jumlah (+ Masuk / - Keluar)" rules={[{ required: true, message: 'Wajib diisi' }]}>
                                    <InputNumber style={{ width: '100%' }} placeholder="Contoh: 50 atau -10" size="large" />
                                </Form.Item>
                                <Form.Item name="keterangan" label="Keterangan">
                                    <Input.TextArea rows={2} placeholder="Contoh: Barang Rusak / Koreksi" />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                                    Simpan Perubahan
                                </Button>
                            </Form>
                        </Col>

                        {/* KANAN: TABEL RIWAYAT + FILTER */}
                        <Col lg={17} xs={24}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                <Title level={5} style={{ margin: 0 }}>Riwayat Mutasi Stok</Title>
                                <Space wrap>
                                    <Input 
                                        prefix={<SearchOutlined />} 
                                        placeholder="Cari ket / ref..." 
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        allowClear
                                        style={{ width: 180 }}
                                    />
                                    <RangePicker 
                                        value={dateRange} 
                                        onChange={setDateRange} 
                                        format="DD/MM/YYYY"
                                        style={{ width: 220 }}
                                        allowClear={true} 
                                    />
                                    <Button 
                                        icon={<PrinterOutlined />} 
                                        onClick={handleGeneratePdf}
                                        loading={isPdfGenerating}
                                        disabled={historyLoading || filteredHistory.length === 0}
                                    >
                                        Print PDF
                                    </Button>
                                </Space>
                            </div>

                            <Table
                                columns={modalHistoryColumns}
                                dataSource={filteredHistory}
                                loading={historyLoading}
                                rowKey="id"
                                pagination={{ pageSize: 8, size: 'small', showTotal: (total) => `Total ${total} riwayat` }}
                                size="small"
                                scroll={{ x: 1000 }} 
                                bordered
                            />
                        </Col>
                    </Row>
                </Spin>
            </Modal>

            {/* MODAL PREVIEW PDF */}
            <Modal
                title="Preview Laporan Stok"
                open={isPdfModalOpen}
                onCancel={() => { setIsPdfModalOpen(false); setPdfPreviewUrl(null); }}
                width="80vw"
                style={{ top: 20 }}
                footer={[
                    <Button key="close" onClick={() => setIsPdfModalOpen(false)}>Tutup</Button>
                ]}
                bodyStyle={{ padding: 0, height: '80vh' }}
            >
                {isPdfGenerating ? (
                    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>Membuat PDF...</div>
                    </div>
                ) : pdfPreviewUrl ? (
                    <iframe src={pdfPreviewUrl} width="100%" height="100%" style={{ border: 'none' }} title="PDF Preview" />
                ) : (
                    <Empty description="Gagal memuat preview PDF" style={{ marginTop: 100 }} />
                )}
            </Modal>
        </>
    );
};

export default StokFormModal;