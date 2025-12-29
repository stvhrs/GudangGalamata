import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, message, Popconfirm, Tooltip, Spin
} from 'antd';
import { DeleteOutlined, HistoryOutlined, UserAddOutlined, FilePdfOutlined } from '@ant-design/icons';
import { ref, remove } from 'firebase/database';
import { db } from '../../api/firebase';

import { usePelangganStream } from '../../hooks/useFirebaseData';
import useDebounce from '../../hooks/useDebounce';
import PelangganForm from './components/PelangganForm';
import CustomerHistoryModal from './components/CustomerHistoryModal';
import PdfPreviewModal from './components/PdfPreviewModal'; 

import { generatePelangganPdfBlob } from '../../utils/pdfCustomer';

const { Content } = Layout;
const { Search } = Input;

export default function PelangganPage() {
    const { pelangganList, loadingPelanggan } = usePelangganStream();

    // --- STATE ---
    const [previewVisible, setPreviewVisible] = useState(false);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const deferredDebouncedSearchText = useDeferredValue(debouncedSearchText);
    const isFiltering = debouncedSearchText !== deferredDebouncedSearchText;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPelanggan, setEditingPelanggan] = useState(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);

    // 1. TAMBAH STATE SORTING
    const [sortState, setSortState] = useState({
        columnKey: null,
        order: null // 'ascend' atau 'descend'
    });

    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 25,
        showSizeChanger: true,
        pageSizeOptions: ['25', '50', '100', '200'],
        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} pelanggan`
    });

    // --- 2. LOGIC FILTERING & SORTING DI PUSAT (useMemo) ---
    // Ini memastikan data untuk Tabel DAN PDF bersumber dari logika yang sama
    const filteredPelanggan = useMemo(() => {
        let data = [...(pelangganList || [])];

        // A. Filter Search
        if (deferredDebouncedSearchText) {
            const query = deferredDebouncedSearchText.toLowerCase();
            data = data.filter(p =>
                (p.nama && p.nama.toLowerCase().includes(query)) ||
                (p.telepon && p.telepon.includes(query))
            );
        }

        // B. Logic Sorting
        if (sortState.order && sortState.columnKey) {
            data.sort((a, b) => {
                const key = sortState.columnKey;
                
                // Logic per kolom
                if (key === 'nama') {
                    return (a.nama || '').localeCompare(b.nama || '');
                } else if (key === 'saldoAwal') {
                    return (parseFloat(a.saldoAwal) || 0) - (parseFloat(b.saldoAwal) || 0);
                } else if (key === 'saldoAkhir') {
                    return (parseFloat(a.saldoAkhir) || 0) - (parseFloat(b.saldoAkhir) || 0);
                }
                return 0;
            });

            // Jika descend, balik urutannya
            if (sortState.order === 'descend') {
                data.reverse();
            }
        } else {
            // Default Sort: UpdatedAt (Terbaru di atas) jika user tidak klik header
            data.sort((a, b) => {
                const dateA = new Date(a.updatedAt || 0).getTime();
                const dateB = new Date(b.updatedAt || 0).getTime();
                return dateB - dateA; 
            });
        }

        return data;
    }, [pelangganList, deferredDebouncedSearchText, sortState]); // Dependency sortState masuk sini

    // --- HANDLERS ---
    
    // 3. UPDATE HANDLER TABLE CHANGE
    const handleTableChange = useCallback((newPagination, filters, sorter) => {
        setPagination(newPagination);
        
        // Simpan state sorting dari interaksi user
        setSortState({
            columnKey: sorter.columnKey, // key kolom yang diklik
            order: sorter.order          // 'ascend', 'descend', atau undefined
        });
    }, []);

    const handlePreviewPdf = useCallback(() => {
        if (!filteredPelanggan || filteredPelanggan.length === 0) {
            message.warning("Tidak ada data untuk ditampilkan");
            return;
        }
        try {
            message.loading({ content: 'Menyiapkan Preview...', key: 'pdf_gen' });
            // filteredPelanggan di sini SUDAH TERURUT karena logic di useMemo
            const blob = generatePelangganPdfBlob(filteredPelanggan);
            const url = URL.createObjectURL(blob);
            setPdfBlobUrl(url);
            setPreviewVisible(true);
            message.success({ content: 'Preview Siap', key: 'pdf_gen' });
        } catch (error) {
            console.error("PDF Error:", error);
            message.error({ content: 'Gagal membuat PDF', key: 'pdf_gen' });
        }
    }, [filteredPelanggan]);

    const handleClosePreview = () => {
        setPreviewVisible(false);
        if (pdfBlobUrl) {
            setTimeout(() => {
                URL.revokeObjectURL(pdfBlobUrl);
                setPdfBlobUrl(null);
            }, 500);
        }
    };

    const handleSearchChange = useCallback((e) => {
        setSearchText(e.target.value);
        if (pagination.current !== 1) setPagination(prev => ({ ...prev, current: 1 }));
    }, [pagination.current]);

    const handleOpenCreate = useCallback(() => {
        setEditingPelanggan(null);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setTimeout(() => setEditingPelanggan(null), 300);
    }, []);

    const handleFormSuccess = useCallback(() => {
        handleCloseModal();
    }, [handleCloseModal]);

    const handleDelete = useCallback(async (idPelanggan) => {
        if (!idPelanggan) return;
        message.loading({ content: 'Menghapus pelanggan...', key: 'del_pel' });
        try {
            await remove(ref(db, `customers/${idPelanggan}`));
            message.success({ content: 'Customer berhasil dihapus', key: 'del_pel' });
        } catch (error) {
            console.error("Error deleting:", error);
            message.error({ content: `Gagal: ${error.message}`, key: 'del_pel' });
        }
    }, []);

    const handleOpenHistory = useCallback((pelanggan) => {
        setSelectedHistoryCustomer(pelanggan);
        setIsHistoryModalOpen(true);
    }, []);

    const handleCloseHistory = useCallback(() => {
        setIsHistoryModalOpen(false);
        setTimeout(() => setSelectedHistoryCustomer(null), 300);
    }, []);

    // --- 4. COLUMNS UPDATE ---
    // Hapus fungsi 'sorter: (a,b) => ...' 
    // Ganti jadi 'sorter: true' dan gunakan 'sortOrder' yang dikontrol state
    const columns = useMemo(() => [
        {
            title: 'No.',
            key: 'index',
            width: 60,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
        },
        {
            title: 'Nama Customer',
            dataIndex: 'nama',
            key: 'nama',
            // Controlled Sorting
            sorter: true, 
            sortOrder: sortState.columnKey === 'nama' && sortState.order,
        },
        {
            title: 'Telepon',
            dataIndex: 'telepon',
            key: 'telepon',
            width: 150,
            render: (tel) => tel || '-',
        },
        {
            title: 'Saldo Awal',
            dataIndex: 'saldoAwal',
            key: 'saldoAwal',
            width: 150,
            align: 'right',
            // Controlled Sorting
            sorter: true,
            sortOrder: sortState.columnKey === 'saldoAwal' && sortState.order,
            render: (val) => {
                const isNegative = (val || 0) < 0;
                const formatted = new Intl.NumberFormat('id-ID', {
                    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
                }).format(val || 0);
                return (
                    <span style={{ color: isNegative ? '#cf1322' : 'inherit', fontWeight: isNegative ? 'bold' : 'normal' }}>
                        {formatted}
                    </span>
                );
            }
        },  
        {
            title: 'Saldo Akhir',
            dataIndex: 'saldoAkhir',
            key: 'saldoAkhir',
            width: 150,
            align: 'right',
            // Controlled Sorting
            sorter: true,
            sortOrder: sortState.columnKey === 'saldoAkhir' && sortState.order,
            render: (val) => {
                const isNegative = (val || 0) < 0;
                const formatted = new Intl.NumberFormat('id-ID', {
                    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
                }).format(val || 0);
                return (
                    <span style={{ color: isNegative ? '#cf1322' : '#048302ff', fontWeight: isNegative ? 'bold' : 'bold' }}>
                        {formatted}
                    </span>
                );
            }
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Lihat Riwayat Transaksi">
                        <Button
                            size="small"
                            type="default"
                            icon={<HistoryOutlined />}
                            onClick={() => handleOpenHistory(record)}
                            style={{ color: '#1890ff', borderColor: '#1890ff' }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Hapus pelanggan?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Hapus"
                        cancelText="Batal"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [pagination, handleDelete, handleOpenHistory, sortState]); // Masukkan sortState ke dependency columns

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <Content style={{ padding: '24px' }}>
                <Card 
                    title="Data Customer" 
                    bordered={false}
                    extra={
                        <Space>
                            <Button 
                                icon={<FilePdfOutlined />} 
                                onClick={handlePreviewPdf}
                                disabled={!filteredPelanggan.length}
                            >
                                Preview PDF
                            </Button>
                            <Button type="primary" icon={<UserAddOutlined />} onClick={handleOpenCreate}>
                                Tambah Customer
                            </Button>
                        </Space>
                    }
                    style={{ borderRadius: 8 }}
                >
                    <div style={{ marginBottom: 16, maxWidth: 400 }}>
                        <Search
                            placeholder="Cari nama atau telepon..."
                            onChange={handleSearchChange}
                            allowClear
                            enterButton
                        />
                    </div>

                    <Spin spinning={loadingPelanggan || isFiltering} tip="Memproses data...">
                        <Table
                            columns={columns}
                            dataSource={filteredPelanggan}
                            rowKey="id"
                            pagination={pagination}
                            onChange={handleTableChange}
                            size="middle"
                            bordered
                            style={{ background: '#fff', borderRadius: 8 }}
                        />
                    </Spin>
                </Card>

                <PelangganForm
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    onSuccess={handleFormSuccess}
                    initialValues={editingPelanggan}
                />

                <CustomerHistoryModal
                    open={isHistoryModalOpen}
                    onCancel={handleCloseHistory}
                    customer={selectedHistoryCustomer}
                />

                <PdfPreviewModal
                    visible={previewVisible}
                    onClose={handleClosePreview}
                    pdfBlobUrl={pdfBlobUrl}
                    fileName={`Data_Pelanggan_${new Date().toISOString().slice(0,10)}.pdf`}
                />
            </Content>
        </Layout>
    );
}