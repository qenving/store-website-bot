import { configManager, Product } from '../config/config';
import { NotFoundError } from '../utils/errors';

export class ProductService {
  getAllProducts(): Product[] {
    return configManager.getAllProducts();
  }

  getProduct(productId: string): Product {
    const product = configManager.getProduct(productId);
    if (!product) {
      throw new NotFoundError('Product', productId);
    }
    return product;
  }

  getProductsByType(type: string): Product[] {
    const products = this.getAllProducts();
    return products.filter(p => p.type === type);
  }

  searchProducts(query: string): Product[] {
    const products = this.getAllProducts();
    const lowerQuery = query.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery)
    );
  }

  isProductAvailable(productId: string): boolean {
    try {
      this.getProduct(productId);
      return true;
    } catch {
      return false;
    }
  }
}

export const productService = new ProductService();
